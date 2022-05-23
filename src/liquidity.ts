import { Address, log, ethereum } from "@graphprotocol/graph-ts"
import { LiquidityPosition, Pair, Token, LiquidityPositionSnapshot } from "../generated/schema"
import { loadOrCreateBundle } from "./bundle"
import { ONE_BI, ZERO_BD } from "./constants"

export function createLiquidityPosition(exchange: Address, user: Address): LiquidityPosition | null {
  const thisFunctionName = 'createLiquidityPosition'

  let id = exchange
    .toHexString()
    .concat('-')
    .concat(user.toHexString())
  let liquidityTokenBalance = LiquidityPosition.load(id)
  if (liquidityTokenBalance === null) {
    let pair = Pair.load(exchange.toHexString())
    if (!pair) {
      log.error('{}: Cannot load pair {}', [thisFunctionName, exchange.toHexString()])
      return null
    }

    pair.liquidityProviderCount = pair.liquidityProviderCount.plus(ONE_BI)
    liquidityTokenBalance = new LiquidityPosition(id)
    liquidityTokenBalance.liquidityTokenBalance = ZERO_BD
    liquidityTokenBalance.pair = exchange.toHexString()
    liquidityTokenBalance.user = user.toHexString()
    liquidityTokenBalance.save()
    pair.save()
  }
  if (liquidityTokenBalance === null) log.error('LiquidityTokenBalance is null', [id])
  return liquidityTokenBalance as LiquidityPosition
}

export function createLiquiditySnapshot(position: LiquidityPosition, event: ethereum.Event): void {
  const thisFunctionName = 'createLiquiditySnapshot'
  
  let timestamp = event.block.timestamp.toI32()
  let bundle = loadOrCreateBundle()
  
  let pair = Pair.load(position.pair)
  if (!pair) {
    log.error('{}: Cannot load pair {}', [thisFunctionName, position.pair])
    return
  }
  
  let token0 = Token.load(pair.token0)
  if (!token0) {
    log.error('{}: Cannot load token {}', [thisFunctionName, pair.token0])
    return
  }
  
  let token1 = Token.load(pair.token1)
  if (!token1) {
    log.error('{}: Cannot load token {}', [thisFunctionName, pair.token1])
    return
  }

  // create new snapshot
  const snapshot = new LiquidityPositionSnapshot(position.id.concat(timestamp.toString()))
  snapshot.liquidityPosition = position.id
  snapshot.timestamp = timestamp
  snapshot.block = event.block.number.toI32()
  snapshot.user = position.user
  snapshot.pair = position.pair
  snapshot.token0PriceUSD = token0.derivedETH.times(bundle.ethPrice)
  snapshot.token1PriceUSD = token1.derivedETH.times(bundle.ethPrice)
  snapshot.reserve0 = pair.reserve0
  snapshot.reserve1 = pair.reserve1
  snapshot.reserveUSD = pair.reserveUSD
  snapshot.liquidityTokenTotalSupply = pair.totalSupply
  snapshot.liquidityTokenBalance = position.liquidityTokenBalance
  snapshot.liquidityPosition = position.id
  snapshot.save()
  position.save()
}
