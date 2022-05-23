import { Address, BigDecimal } from "@graphprotocol/graph-ts"
import { Factory, Pair, Token } from "../generated/schema"
import { loadOrCreateBundle } from "./bundle"
import { ONE_BD, ZERO_BD } from "./constants"
import { convertTokenToDecimal } from "./helpers"
import { getEthPriceInUSD, findEthPerToken, getTrackedLiquidityUSD } from "./pricing"
import { getToken0Price, getPairReserves } from "./reader"

export function handleSync(factory: Factory, pair: Pair, token0: Token, token1: Token): void {
  // reset factory liquidity by subtracting onluy tarcked liquidity
  factory.totalLiquidityETH = factory.totalLiquidityETH.minus(pair.trackedReserveETH as BigDecimal)

  // Get current pair reserves
  const pairReserves = getPairReserves(Address.fromString(pair.id))
  const reserve0 = pairReserves[0]
  const reserve1 = pairReserves[1]

  // reset token total liquidity amounts
  token0.totalLiquidity = token0.totalLiquidity.minus(pair.reserve0)
  token1.totalLiquidity = token1.totalLiquidity.minus(pair.reserve1)

  pair.reserve0 = convertTokenToDecimal(reserve0, token0.decimals)
  pair.reserve1 = convertTokenToDecimal(reserve1, token1.decimals)

  // Calculate token prices
  pair.token0Price = getToken0Price(Address.fromString(pair.id), token1.decimals)
  if (pair.token0Price.notEqual(ZERO_BD)) {
    pair.token1Price = ONE_BD.div(pair.token0Price)
  } else {
    pair.token1Price = ZERO_BD
  }

  // update ETH price now that reserves could have changed
  const bundle = loadOrCreateBundle()
  bundle.ethPrice = getEthPriceInUSD()
  bundle.save()

  token0.derivedETH = findEthPerToken(token0)
  token1.derivedETH = findEthPerToken(token1)
  token0.save()
  token1.save()

  // get tracked liquidity - will be 0 if neither is in whitelist
  let trackedLiquidityETH: BigDecimal
  if (bundle.ethPrice.notEqual(ZERO_BD)) {
    trackedLiquidityETH = getTrackedLiquidityUSD(pair.reserve0, token0, pair.reserve1, token1).div(
      bundle.ethPrice
    )
  } else {
    trackedLiquidityETH = ZERO_BD
  }

  // use derived amounts within pair
  pair.trackedReserveETH = trackedLiquidityETH
  pair.reserveETH = pair.reserve0
    .times(token0.derivedETH as BigDecimal)
    .plus(pair.reserve1.times(token1.derivedETH as BigDecimal))
  pair.reserveUSD = pair.reserveETH.times(bundle.ethPrice)

  // use tracked amounts globally
  factory.totalLiquidityETH = factory.totalLiquidityETH.plus(trackedLiquidityETH)
  factory.totalLiquidityUSD = factory.totalLiquidityETH.times(bundle.ethPrice)

  // now correctly set liquidity amounts for each token
  token0.totalLiquidity = token0.totalLiquidity.plus(pair.reserve0)
  token1.totalLiquidity = token1.totalLiquidity.plus(pair.reserve1)

  // save entities
  pair.save()
  factory.save()
  token0.save()
  token1.save()
}
