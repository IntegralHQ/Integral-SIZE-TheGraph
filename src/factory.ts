import { Factory } from "../generated/schema"
import { createBundle } from "./bundle"
import { FACTORY_ADDRESS, ZERO_BD, ZERO_BI } from "./constants"

export function loadOrCreateFactory(): Factory {
  let factory = Factory.load(FACTORY_ADDRESS)
  if (!factory) {
    factory = new Factory(FACTORY_ADDRESS)

    factory.pairCount = 0
    factory.totalVolumeUSD = ZERO_BD
    factory.totalVolumeETH = ZERO_BD
    factory.totalLiquidityUSD = ZERO_BD
    factory.totalLiquidityETH = ZERO_BD
    factory.totalFeesUSD = ZERO_BD
    factory.totalFeesETH = ZERO_BD
    factory.txCount = ZERO_BI

    createBundle()
  }

  return factory
}
