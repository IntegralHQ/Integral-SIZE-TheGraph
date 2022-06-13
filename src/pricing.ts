/* eslint-disable prefer-const */
import { Pair, Token } from '../generated/schema'
import { Address, BigDecimal, log } from '@graphprotocol/graph-ts/index'
import { ADDRESS_ZERO, WETH_USDC_ADDRESS, factoryContract, ONE_BD, WETH_ADDRESS, ZERO_BD, WETH_DECIMALS, uniswapV2FactoryContract } from './constants'
import { loadOrCreateBundle } from './bundle';
import { getToken0Price, getToken1Price } from './reader';
import { convertBigIntToBigDecimal, getUniswapV2PairContract } from './helpers';

export function getEthPriceInUSD(): BigDecimal {
  // WETH_USDC_ADDRESS pair: token0 = USDC, token1 = WETH
  return getToken1Price(Address.fromString(WETH_USDC_ADDRESS), WETH_DECIMALS)
}

export function findEthPerToken(token: Token): BigDecimal {
  const thisFunctionName = 'findEthPerToken'

  if (token.id == WETH_ADDRESS) {
    return ONE_BD
  }

  // First, see if we have the ETH-token pair. If yes, get the token price in ETH.
  const pairAddress = factoryContract.getPair(Address.fromString(WETH_ADDRESS), Address.fromString(token.id))
  if (pairAddress.toHexString() != ADDRESS_ZERO) {
    const pair = Pair.load(pairAddress.toHexString())
    if (!pair) {
      log.warning('{}: Cannot load pair {}', [thisFunctionName, pairAddress.toHexString()])
      return ZERO_BD
    }

    const token0 = Token.load(pair.token0)
    if (!token0) {
      log.warning('{}: Cannot load token {}', [thisFunctionName, pair.token0])
      return ZERO_BD
    }
  
    const token1 = Token.load(pair.token1)
    if (!token1) {
      log.warning('{}: Cannot load token {}', [thisFunctionName, pair.token1])
      return ZERO_BD
    }

    return token0.id == WETH_ADDRESS
      ? getToken1Price(pairAddress, token1.decimals)
      : getToken0Price(pairAddress, token1.decimals)
  }  

  // If we don't have the ETH-token pair, look for it on Uniswap.
  const uniPairAddress = uniswapV2FactoryContract.getPair(Address.fromString(WETH_ADDRESS), Address.fromString(token.id))
  if (uniPairAddress.notEqual(Address.zero())) {
    const uniPair = getUniswapV2PairContract(pairAddress)
    if (!uniPair) {
      log.warning('{}: Cannot load Uniswap pair {} for token {}', [thisFunctionName, uniPairAddress.toHexString(), token.id])
      return ZERO_BD
    }

    let tokenPriceInEth = ZERO_BD
    const reserves = uniPair.getReserves()

    if (uniPair.token0().equals(Address.fromString(token.id))) {
      const reserve0 = convertBigIntToBigDecimal(reserves.value0, token.decimals);
      const reserve1 = convertBigIntToBigDecimal(reserves.value1, WETH_DECIMALS);
      if (reserve0.notEqual(ZERO_BD)) {
        tokenPriceInEth = reserve1.div(reserve0)
      }
    } else {
      const reserve0 = convertBigIntToBigDecimal(reserves.value0, WETH_DECIMALS);
      const reserve1 = convertBigIntToBigDecimal(reserves.value1, token.decimals);
      if (reserve1.notEqual(ZERO_BD)) {
        tokenPriceInEth = reserve0.div(reserve1)
      }
    }

    return tokenPriceInEth
  }

  log.warning('{}: Could not find token price in ETH for token {}', [thisFunctionName, token.id])

  return ZERO_BD
}

// Tokens that should contribute to tracked volume and liquidity.
let WHITELIST: string[] = [
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
  '0x4e3fbd56cd56c3e72c1403e103b45db9da5b9d2b', // CVX
  '0x6b3595068778dd592e39a122f4f5a5cf09c90fe2', // SUSHI
]

/**
 * Accepts tokens and amounts, returns tracked volume amount based on token whitelist.
 * If one token is whitelisted, return amount for that token converted to USD.
 * If both are, return average of two amounts.
 * If neither is, return 0.
 */
export function getTrackedVolumeUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token
): BigDecimal {
  let bundle = loadOrCreateBundle()
  let price0 = token0.derivedETH.times(bundle.ethPrice)
  let price1 = token1.derivedETH.times(bundle.ethPrice)

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0
      .times(price0)
      .plus(tokenAmount1.times(price1))
      .div(BigDecimal.fromString('2'))
  }

  // take full value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0)
  }

  // take full value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1)
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD
}

/**
 * Accepts tokens and amounts, returns tracked liquidity amount based on token whitelist.
 * If one token is whitelisted, return amount for that token converted to USD * 2.
 * If both are, return the sum of two amounts.
 * If neither is, return 0.
 */
 export function getTrackedLiquidityUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token
): BigDecimal {
  const bundle = loadOrCreateBundle()
  const price0 = token0.derivedETH.times(bundle.ethPrice)
  const price1 = token1.derivedETH.times(bundle.ethPrice)

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).plus(tokenAmount1.times(price1))
  }

  // take double value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).times(BigDecimal.fromString('2'))
  }

  // take double value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1).times(BigDecimal.fromString('2'))
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD
}
