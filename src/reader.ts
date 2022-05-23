import { Address, BigDecimal, BigInt } from "@graphprotocol/graph-ts"
import { ONE_BD, readerContract } from "./constants"
import { convertTokenToDecimal } from "./helpers"

export function getPairReserves(pairAddress: Address): BigInt[] {
  const pairParams = readerContract.getPairParameters(pairAddress)
  return [ pairParams.value1, pairParams.value2 ]
}

// Returns the price of token0 in token1.
export function getToken0Price(pairAddress: Address, token1Decimals: BigInt): BigDecimal {
  const pairParams = readerContract.getPairParameters(pairAddress)
  return convertTokenToDecimal(pairParams.value3, token1Decimals)
}

// Returns the price of token1 in token0.
export function getToken1Price(pairAddress: Address, token1Decimals: BigInt): BigDecimal {
  return ONE_BD.div(getToken0Price(pairAddress, token1Decimals))
}
