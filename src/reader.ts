import { Address, BigDecimal, BigInt } from '@graphprotocol/graph-ts'
import { readerContract } from './constants'
import { convertBigIntToBigDecimal } from './helpers'

export function getPairReserves(pairAddress: Address): BigInt[] {
  const pairParams = readerContract.getPairParameters(pairAddress)
  return [pairParams.value1, pairParams.value2]
}

// Returns the price of token0 in token1.
export function getToken0Price(pairAddress: Address, token1Decimals: BigInt): BigDecimal {
  const pairParams = readerContract.getPairParameters(pairAddress)
  return convertBigIntToBigDecimal(pairParams.value3, token1Decimals)
}

// Returns the price of token1 in token0.
export function getToken1Price(pairAddress: Address, token0Decimals: BigInt): BigDecimal {
  const BI_ONE_18 = BigInt.fromI32(10).pow(18)
  const pairParams = readerContract.getPairParameters(pairAddress)
  const invertedPrice = BI_ONE_18.times(BI_ONE_18).div(pairParams.value3)
  return convertBigIntToBigDecimal(invertedPrice, token0Decimals)
}
