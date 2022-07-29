/* eslint-disable prefer-const */
import { Pair, Token } from '../generated/schema'
import { Address, BigDecimal, log } from '@graphprotocol/graph-ts/index'
import { ADDRESS_ZERO, WETH_USDC_ADDRESS, factoryContract, ONE_BD, WETH_ADDRESS, ZERO_BD, WETH_DECIMALS, uniswapV2FactoryContract } from './constants'
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
