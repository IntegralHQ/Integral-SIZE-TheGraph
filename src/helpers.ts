import { Address, BigDecimal, BigInt } from "@graphprotocol/graph-ts"
import { ONE_BI, ZERO_BI } from "./constants"
import { UniswapPairV2 } from "../generated/templates/Pair/UniswapPairV2";

export function exponentToBigDecimal(decimals: BigInt): BigDecimal {
  let bd = BigDecimal.fromString('1')
  for (let i = ZERO_BI; i.lt(decimals as BigInt); i = i.plus(ONE_BI)) {
    bd = bd.times(BigDecimal.fromString('10'))
  }
  return bd
}

export function convertBigIntToBigDecimal(tokenAmount: BigInt, decimals: BigInt): BigDecimal {
  if (decimals == ZERO_BI) {
    return tokenAmount.toBigDecimal()
  }
  return tokenAmount.toBigDecimal().div(exponentToBigDecimal(decimals))
}

export function getUniswapV2PairContract(pairAddress: Address): UniswapPairV2 {
  return UniswapPairV2.bind(pairAddress)
}
