/* eslint-disable prefer-const */
import { Pair, Token } from '../generated/schema'
import { Address, BigDecimal, BigInt, log } from '@graphprotocol/graph-ts/index'
import {
  ADDRESS_ZERO,
  Config,
  factoryContract,
  ONE_BD,
  ZERO_BD,
  WETH_DECIMALS,
  UNISWAP_V2_FACTORY_KEY,
  UNISWAP_V3_FACTORY_KEY,
  ZERO_BI,
  DEFAULT_UNISWAP_V3_FEE,
} from './constants'
import { getToken0Price, getToken1Price } from './reader'
import { convertBigIntToBigDecimal, getUniswapV2PairContract, getUniswapV3PoolContract } from './helpers'
import { UniswapFactoryV2 } from '../generated/templates/Pair/UniswapFactoryV2'
import { UniswapFactoryV3 } from '../generated/templates/Pair/UniswapFactoryV3'
import { UniswapPoolV3 } from '../generated/templates/Pair/UniswapPoolV3'

export function getEthPriceInUSD(): BigDecimal {
  const wethAddress = Config.mustGet('WETH')
  const usdcAddress = Config.isSet('USDC.e') ? Config.mustGet('USDC.e') : Config.mustGet('USDC')
  const pairAddress = Config.isSet('WETH_USDC.e') ? Config.mustGet('WETH_USDC.e') : Config.mustGet('WETH_USDC')
  // Addresses in config should be lowercased already
  if (usdcAddress < wethAddress) {
    return getToken1Price(Address.fromString(pairAddress), WETH_DECIMALS)
  } else {
    return getToken0Price(Address.fromString(pairAddress), WETH_DECIMALS)
  }
}

export function findEthPerToken(token: Token): BigDecimal {
  const thisFunctionName = 'findEthPerToken'

  if (token.id == Config.mustGet('WETH')) {
    return ONE_BD
  }

  // First, see if we have the ETH-token pair. If yes, get the token price in ETH.
  const pairAddress = factoryContract.getPair(Address.fromString(Config.mustGet('WETH')), Address.fromString(token.id))
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

    return token0.id == Config.mustGet('WETH')
      ? getToken1Price(pairAddress, token0.decimals)
      : getToken0Price(pairAddress, token1.decimals)
  }

  // If we don't have the ETH-token pair, look for it on Uniswap.
  if (Config.isSet(UNISWAP_V2_FACTORY_KEY)) {
    const uniswapV2FactoryContract = getUniswapV2Factory(Config.mustGet(UNISWAP_V2_FACTORY_KEY))
    const uniPairAddress = uniswapV2FactoryContract.getPair(
      Address.fromString(Config.mustGet('WETH')),
      Address.fromString(token.id)
    )
    if (uniPairAddress.notEqual(Address.zero())) {
      const uniPair = getUniswapV2PairContract(uniPairAddress)
      if (!uniPair) {
        log.warning('{}: Cannot load Uniswap pair {} for token {}', [
          thisFunctionName,
          uniPairAddress.toHexString(),
          token.id,
        ])
      } else {
        let tokenPriceInEth = ZERO_BD
        const reserves = uniPair.getReserves()

        if (uniPair.token0().equals(Address.fromString(token.id))) {
          const reserve0 = convertBigIntToBigDecimal(reserves.value0, token.decimals)
          const reserve1 = convertBigIntToBigDecimal(reserves.value1, WETH_DECIMALS)
          if (reserve0.notEqual(ZERO_BD)) {
            tokenPriceInEth = reserve1.div(reserve0)
          }
        } else {
          const reserve0 = convertBigIntToBigDecimal(reserves.value0, WETH_DECIMALS)
          const reserve1 = convertBigIntToBigDecimal(reserves.value1, token.decimals)
          if (reserve1.notEqual(ZERO_BD)) {
            tokenPriceInEth = reserve0.div(reserve1)
          }
        }
        return tokenPriceInEth
      }
    }
  }

  if (Config.isSet(UNISWAP_V3_FACTORY_KEY)) {
    const uniswapV3FactoryContract = getUniswapV3Factory(Config.mustGet(UNISWAP_V3_FACTORY_KEY))
    const uniPoolAddress = uniswapV3FactoryContract.getPool(
      Address.fromString(Config.mustGet('WETH')),
      Address.fromString(token.id),
      DEFAULT_UNISWAP_V3_FEE
    )
    if (uniPoolAddress.notEqual(Address.zero())) {
      const uniPool = getUniswapV3PoolContract(uniPoolAddress)
      if (!uniPool) {
        log.warning('{}: Cannot load Uniswap pair {} for token {}', [
          thisFunctionName,
          uniPoolAddress.toHexString(),
          token.id,
        ])
      } else {
        let tokenPriceInEth = ZERO_BD
        const sqrtPrice = uniPool.slot0().getSqrtPriceX96()
        const decimalsConverter = getDecimalConverter(uniPool)
        if (uniPool.liquidity().gt(ZERO_BI) && decimalsConverter) {
          if (uniPool.token0().equals(Address.fromString(token.id))) {
            tokenPriceInEth = convertBigIntToBigDecimal(
              sqrtPrice.pow(2).times(decimalsConverter).div(BigInt.fromI32(2).pow(196)),
              WETH_DECIMALS
            )
          } else {
            tokenPriceInEth = convertBigIntToBigDecimal(
              BigInt.fromI32(2).pow(196).div(sqrtPrice.pow(2).times(decimalsConverter)),
              WETH_DECIMALS
            )
          }
        }
        log.debug('{}, find with uniswap v3 {}, {}', [thisFunctionName, token.id, tokenPriceInEth.toString()])
        return tokenPriceInEth
      }
    }
  }

  log.warning('{}: Could not find token price in ETH for token {}', [thisFunctionName, token.id])

  return ZERO_BD
}

function getUniswapV2Factory(address: string): UniswapFactoryV2 {
  return UniswapFactoryV2.bind(Address.fromString(address))
}

function getUniswapV3Factory(address: string): UniswapFactoryV3 {
  return UniswapFactoryV3.bind(Address.fromString(address))
}

function getDecimalConverter(pool: UniswapPoolV3): BigInt | null {
  const thisFunctionName = 'getDecimalConverter'
  const token0 = Token.load(pool.token0().toHexString())
  const token1 = Token.load(pool.token1().toHexString())
  if (!token0) {
    log.warning('{}: Cannot load Uniswap pool {} token0 {}', [
      thisFunctionName,
      pool._address.toHexString(),
      pool.token0().toHexString(),
    ])
    return null
  }
  if (!token1) {
    log.warning('{}: Cannot load Uniswap pool {} token1 {}', [
      thisFunctionName,
      pool._address.toHexString(),
      pool.token1().toHexString(),
    ])
    return null
  }

  /*global u8*/
  const xDecimals = u8(token0.decimals.toU32())
  const yDecimals = u8(token1.decimals.toU32())
  return BigInt.fromI32(10).pow(18 + xDecimals - yDecimals)
}
