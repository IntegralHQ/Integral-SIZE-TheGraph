import { BigInt, BigDecimal, store, Address, Bytes, log } from '@graphprotocol/graph-ts'
import { Transaction, Mint, Burn, Swap, Pair, Token} from '../generated/schema'
import { Pair as PairTemplate} from "../generated/templates"
import {
  TwapPair as PairContract,
  Mint as MintEvent,
  Burn as BurnEvent,
  Swap as SwapEvent,
  Transfer as TransferEvent } from '../generated/templates/Pair/TwapPair'
import { PairCreated as PairCreatedEvent } from '../generated/TwapFactory/TwapFactory'
import { updateDayData, updatePairDayData, updatePairHourData, updateTokenDayData } from './dayUpdates'
import { loadOrCreateFactory } from './factory'
import { convertTokenToDecimal } from './helpers'
import { getTrackedVolumeUSD } from './pricing'
import { loadOrCreateToken } from './token'
import { createLiquidityPosition, createLiquiditySnapshot } from './liquidity'
import { createUser } from './user'
import { loadOrCreateBundle } from './bundle'
import { ADDRESS_ZERO, BI_18, ONE_BI, ZERO_BD, ZERO_BI } from './constants'
import { handleSync } from './sync'

export function handlePairCreated(event: PairCreatedEvent): void {
  const factory = loadOrCreateFactory()
  const token0 = loadOrCreateToken(event.params.token0)
  const token1 = loadOrCreateToken(event.params.token1)
  
  if (token0 && token1) {
    // Create the pair entity
    const pair = new Pair(event.params.pair.toHexString())
    pair.token0 = token0.id
    pair.token1 = token1.id
    pair.liquidityProviderCount = ZERO_BI
    pair.createdAtTimestamp = event.block.timestamp
    pair.createdAtBlockNumber = event.block.number
    pair.txCount = ZERO_BI
    pair.reserve0 = ZERO_BD
    pair.reserve1 = ZERO_BD
    pair.trackedReserveETH = ZERO_BD
    pair.reserveETH = ZERO_BD
    pair.reserveUSD = ZERO_BD
    pair.totalSupply = ZERO_BD
    pair.volumeToken0 = ZERO_BD
    pair.volumeToken1 = ZERO_BD
    pair.volumeUSD = ZERO_BD
    pair.untrackedVolumeUSD = ZERO_BD
    pair.token0Price = ZERO_BD
    pair.token1Price = ZERO_BD
    
    // Start indexing the new pair contract
    PairTemplate.create(event.params.pair)
    
    factory.pairCount += 1

    // Save all entities
    token0.save()
    token1.save()
    pair.save()
    factory.save()
  }
}

function isCompleteMint(mintId: string): boolean {
  const mintEntity = Mint.load(mintId)
  if (!mintEntity) {
      return false
  }
  return mintEntity.sender !== null
}

export function handleTransfer(event: TransferEvent): void {
  const thisFunctionName = 'handleTransfer'

  // ignore initial transfers for first adds
  if (event.params.to.toHexString() == ADDRESS_ZERO && event.params.value.equals(BigInt.fromI32(1000))) {
    log.info('{}: Ignoring initial transfers', [thisFunctionName])
    return
  }

  const factory = loadOrCreateFactory()
  const transactionHash = event.transaction.hash.toHexString()

  // user stats
  const from = event.params.from
  createUser(from)
  const to = event.params.to
  createUser(to)

  // get pair and load contract
  const pair = Pair.load(event.address.toHexString())
  if (!pair) {
    log.error('{}: Cannot load pair {}', [thisFunctionName, event.address.toHex()])
    return
  }
  const pairContract = PairContract.bind(event.address)

  // liquidity token amount being transfered
  const value = convertTokenToDecimal(event.params.value, BI_18)

  // get or create transaction
  let transaction = Transaction.load(transactionHash)
  if (transaction === null) {
    transaction = new Transaction(transactionHash)
    transaction.blockNumber = event.block.number
    transaction.timestamp = event.block.timestamp
    transaction.mints = []
    transaction.burns = []
    transaction.swaps = []
  }

  // mints
  const mints = transaction.mints
  if (from.toHexString() == ADDRESS_ZERO) {
    // update total supply
    pair.totalSupply = pair.totalSupply.plus(value)
    pair.save()

    // create new mint if no mints so far or if last one is done already
    if (mints.length === 0 || isCompleteMint(mints[mints.length - 1])) {
      const mint = new Mint(
        event.transaction.hash
          .toHexString()
          .concat('-')
          .concat(BigInt.fromI32(mints.length).toString())
      )
      mint.transaction = transaction.id
      mint.pair = pair.id
      mint.to = to
      mint.liquidity = value
      mint.timestamp = transaction.timestamp
      mint.transaction = transaction.id
      mint.save()

      // update mints in transaction
      transaction.mints = mints.concat([mint.id])

      // save entities
      transaction.save()
      factory.save()
    }
  }

  // case where direct send first on ETH withdrawls
  if (event.params.to.toHexString() == pair.id) {
    const burns = transaction.burns
    const burn = new Burn(
      event.transaction.hash
        .toHexString()
        .concat('-')
        .concat(BigInt.fromI32(burns.length).toString())
    )
    burn.transaction = transaction.id
    burn.pair = pair.id
    burn.liquidity = value
    burn.timestamp = transaction.timestamp
    burn.to = event.params.to
    burn.sender = event.params.from
    burn.needsComplete = true
    burn.transaction = transaction.id
    burn.save()

    // TODO: Consider using .concat() for handling array updates to protect
    // against unintended side effects for other code paths.
    burns.push(burn.id)
    transaction.burns = burns
    transaction.save()
  }

  // burn
  if (event.params.to.toHexString() == ADDRESS_ZERO && event.params.from.toHexString() == pair.id) {
    pair.totalSupply = pair.totalSupply.minus(value)
    pair.save()

    // this is a new instance of a logical burn
    const burns = transaction.burns
    let burn: Burn
    if (burns.length > 0) {
      const currentBurn = Burn.load(burns[burns.length - 1])
      if (currentBurn && currentBurn.needsComplete) {
        burn = currentBurn as Burn
      } else {
        burn = new Burn(
          event.transaction.hash
            .toHexString()
            .concat('-')
            .concat(BigInt.fromI32(burns.length).toString())
        )
        burn.transaction = transaction.id
        burn.needsComplete = false
        burn.pair = pair.id
        burn.liquidity = value
        burn.transaction = transaction.id
        burn.timestamp = transaction.timestamp
      }
    } else {
      burn = new Burn(
        event.transaction.hash
          .toHexString()
          .concat('-')
          .concat(BigInt.fromI32(burns.length).toString())
      )
      burn.transaction = transaction.id
      burn.needsComplete = false
      burn.pair = pair.id
      burn.liquidity = value
      burn.transaction = transaction.id
      burn.timestamp = transaction.timestamp
    }

    // if this logical burn included a fee mint, account for this
    if (mints.length !== 0 && !isCompleteMint(mints[mints.length - 1])) {
      const mint = Mint.load(mints[mints.length - 1])
      burn.feeTo = mint ? mint.to : null
      burn.feeLiquidity = mint ? mint.liquidity : null
      // remove the logical mint
      store.remove('Mint', mints[mints.length - 1])
      // update the transaction

      // TODO: Consider using .slice().pop() to protect against unintended
      // side effects for other code paths.
      mints.pop()
      transaction.mints = mints
      transaction.save()
    }
    burn.save()
    // if accessing last one, replace it
    if (burn.needsComplete) {
      // TODO: Consider using .slice(0, -1).concat() to protect against
      // unintended side effects for other code paths.
      burns[burns.length - 1] = burn.id
    }
    // else add new one
    else {
      // TODO: Consider using .concat() for handling array updates to protect
      // against unintended side effects for other code paths.
      burns.push(burn.id)
    }
    transaction.burns = burns
    transaction.save()
  }

  if (from.toHexString() != ADDRESS_ZERO && from.toHexString() != pair.id) {
    const fromUserLiquidityPosition = createLiquidityPosition(event.address, from)
    if (fromUserLiquidityPosition) {
      fromUserLiquidityPosition.liquidityTokenBalance = convertTokenToDecimal(pairContract.balanceOf(from), BI_18)
      fromUserLiquidityPosition.save()
      createLiquiditySnapshot(fromUserLiquidityPosition, event)
    }
  }

  if (event.params.to.toHexString() != ADDRESS_ZERO && to.toHexString() != pair.id) {
    const toUserLiquidityPosition = createLiquidityPosition(event.address, to)
    if (toUserLiquidityPosition) {
      toUserLiquidityPosition.liquidityTokenBalance = convertTokenToDecimal(pairContract.balanceOf(to), BI_18)
      toUserLiquidityPosition.save()
      createLiquiditySnapshot(toUserLiquidityPosition, event)
    }
  }

  transaction.save()
}
  
export function handleMint(event: MintEvent): void {
  const thisFunctionName = 'handleMint'

  const transaction = Transaction.load(event.transaction.hash.toHexString())
  if (!transaction) {
    log.error('{}: Cannot load transaction {}', [thisFunctionName, event.transaction.hash.toHexString()])
    return
  }
  
  const mints = transaction.mints
  const mint = Mint.load(mints[mints.length - 1])
  if (!mint) {
    log.error('{}: Cannot load the last mint in transaction {}', [thisFunctionName, event.transaction.hash.toHexString()])
    return
  }

  const pair = Pair.load(event.address.toHex())
  if (!pair) {
    log.error('{}: Cannot load pair {}', [thisFunctionName, event.address.toHex()])
    return
  }
  
  const factory = loadOrCreateFactory()

  const token0 = Token.load(pair.token0)
  if (!token0) {
    log.error('{}: Cannot load token {}', [thisFunctionName, pair.token0])
    return
  }

  const token1 = Token.load(pair.token1)
  if (!token1) {
    log.error('{}: Cannot load token {}', [thisFunctionName, pair.token1])
    return
  }

  // update exchange info (except balances, sync will cover that)
  // TODO: update balances, as we don't have sync
  const token0Amount = convertTokenToDecimal(event.params.amount0In, token0.decimals)
  const token1Amount = convertTokenToDecimal(event.params.amount1In, token1.decimals)

  // update txn counts
  token0.txCount = token0.txCount.plus(ONE_BI)
  token1.txCount = token1.txCount.plus(ONE_BI)

  // get new amounts of USD and ETH for tracking
  const bundle = loadOrCreateBundle()
  const amountTotalUSD = token1.derivedETH
    .times(token1Amount)
    .plus(token0.derivedETH.times(token0Amount))
    .times(bundle.ethPrice)

  // update txn counts
  pair.txCount = pair.txCount.plus(ONE_BI)
  factory.txCount = factory.txCount.plus(ONE_BI)

  // save entities
  token0.save()
  token1.save()
  pair.save()
  factory.save()

  mint.sender = event.params.sender
  mint.amount0 = token0Amount
  mint.amount1 = token1Amount
  mint.logIndex = event.logIndex
  mint.amountUSD = amountTotalUSD
  mint.save()

  // update the LP position
  const liquidityPosition = createLiquidityPosition(event.address, Address.fromBytes(mint.to))
  if (liquidityPosition) {
    createLiquiditySnapshot(liquidityPosition, event)
  }

  handleSync(factory, pair, token0, token1)

  // update day entities
  updatePairDayData(event)
  updatePairHourData(event)
  updateDayData(event)
  updateTokenDayData(token0, event)
  updateTokenDayData(token1, event)
}

export function handleBurn(event: BurnEvent): void {
  const thisFunctionName = 'handleBurn'
  
  const transaction = Transaction.load(event.transaction.hash.toHexString())

  // safety check
  if (transaction === null) {
    return
  }

  const burns = transaction.burns
  const burn = Burn.load(burns[burns.length - 1])
  if (!burn) {
    log.error('{}: Cannot load the last burn in transaction {}', [thisFunctionName, event.transaction.hash.toHexString()])
    return
  }

  const pair = Pair.load(event.address.toHex())
  if (!pair) {
    log.error('{}: Cannot load pair {}', [thisFunctionName, event.address.toHex()])
    return
  }

  const factory = loadOrCreateFactory()

  //update token info
  const token0 = Token.load(pair.token0)
  if (!token0) {
    log.error('{}: Cannot load token {}', [thisFunctionName, pair.token0])
    return
  }

  const token1 = Token.load(pair.token1)
  if (!token1) {
    log.error('{}: Cannot load token {}', [thisFunctionName, pair.token1])
    return
  }

  const token0Amount = convertTokenToDecimal(event.params.amount0Out, token0.decimals)
  const token1Amount = convertTokenToDecimal(event.params.amount1Out, token1.decimals)

  // update txn counts
  token0.txCount = token0.txCount.plus(ONE_BI)
  token1.txCount = token1.txCount.plus(ONE_BI)

  // get new amounts of USD and ETH for tracking
  const bundle = loadOrCreateBundle()
  const amountTotalUSD = token1.derivedETH
    .times(token1Amount)
    .plus(token0.derivedETH.times(token0Amount))
    .times(bundle.ethPrice)

  // update txn counts
  factory.txCount = factory.txCount.plus(ONE_BI)
  pair.txCount = pair.txCount.plus(ONE_BI)

  // update global counter and save
  token0.save()
  token1.save()
  pair.save()
  factory.save()

  // update burn
  // burn.sender = event.params.sender
  burn.amount0 = token0Amount
  burn.amount1 = token1Amount
  // burn.to = event.params.to
  burn.logIndex = event.logIndex
  burn.amountUSD = amountTotalUSD
  burn.save()

  // update the LP position
  if (burn.sender !== null) {
    const liquidityPosition = createLiquidityPosition(event.address, Address.fromBytes(burn.sender as Bytes))
    if (liquidityPosition) {
        createLiquiditySnapshot(liquidityPosition, event)
    }
  }

  handleSync(factory, pair, token0, token1)

  // update day entities
  updatePairDayData(event)
  updatePairHourData(event)
  updateDayData(event)
  updateTokenDayData(token0, event)
  updateTokenDayData(token1, event)
}

export function handleSwap(event: SwapEvent): void {
  const thisFunctionName = 'handleBurn'

  const pair = Pair.load(event.address.toHexString())
  if (!pair) {
    log.error('{}: Cannot load pair {}', [thisFunctionName, event.address.toHex()])
    return
  }  

  const token0 = Token.load(pair.token0)
  if (!token0) {
    log.error('{}: Cannot load token {}', [thisFunctionName, pair.token0])
    return
  }

  const token1 = Token.load(pair.token1)
  if (!token1) {
    log.error('{}: Cannot load token {}', [thisFunctionName, pair.token1])
    return
  }

  const amount0In = convertTokenToDecimal(event.params.amount0In, token0.decimals)
  const amount1In = convertTokenToDecimal(event.params.amount1In, token1.decimals)
  const amount0Out = convertTokenToDecimal(event.params.amount0Out, token0.decimals)
  const amount1Out = convertTokenToDecimal(event.params.amount1Out, token1.decimals)

  // totals for volume updates
  const amount0Total = amount0Out.plus(amount0In)
  const amount1Total = amount1Out.plus(amount1In)

  // ETH/USD prices
  const bundle = loadOrCreateBundle()

  // get total amounts of derived USD and ETH for tracking
  const derivedAmountETH = token1.derivedETH
    .times(amount1Total)
    .plus(token0.derivedETH.times(amount0Total))
    .div(BigDecimal.fromString('2'))
  const derivedAmountUSD = derivedAmountETH.times(bundle.ethPrice)

  // only accounts for volume through white listed tokens
  const trackedAmountUSD = getTrackedVolumeUSD(amount0Total, token0, amount1Total, token1)

  let trackedAmountETH: BigDecimal
  if (bundle.ethPrice.equals(ZERO_BD)) {
    trackedAmountETH = ZERO_BD
  } else {
    trackedAmountETH = trackedAmountUSD.div(bundle.ethPrice)
  }

  // update token0 global volume and token liquidity stats
  token0.tradeVolume = token0.tradeVolume.plus(amount0In.plus(amount0Out))
  token0.tradeVolumeUSD = token0.tradeVolumeUSD.plus(trackedAmountUSD)
  token0.untrackedVolumeUSD = token0.untrackedVolumeUSD.plus(derivedAmountUSD)

  // update token1 global volume and token liquidity stats
  token1.tradeVolume = token1.tradeVolume.plus(amount1In.plus(amount1Out))
  token1.tradeVolumeUSD = token1.tradeVolumeUSD.plus(trackedAmountUSD)
  token1.untrackedVolumeUSD = token1.untrackedVolumeUSD.plus(derivedAmountUSD)

  // update txn counts
  token0.txCount = token0.txCount.plus(ONE_BI)
  token1.txCount = token1.txCount.plus(ONE_BI)

  // update pair volume data, use tracked amount if we have it as its probably more accurate
  pair.volumeUSD = pair.volumeUSD.plus(trackedAmountUSD)
  pair.volumeToken0 = pair.volumeToken0.plus(amount0Total)
  pair.volumeToken1 = pair.volumeToken1.plus(amount1Total)
  pair.untrackedVolumeUSD = pair.untrackedVolumeUSD.plus(derivedAmountUSD)
  pair.txCount = pair.txCount.plus(ONE_BI)

  // update global values, only used tracked amounts for volume
  const factory = loadOrCreateFactory()
  factory.totalVolumeUSD = factory.totalVolumeUSD.plus(trackedAmountUSD)
  factory.totalVolumeETH = factory.totalVolumeETH.plus(trackedAmountETH)
  factory.untrackedVolumeUSD = factory.untrackedVolumeUSD.plus(derivedAmountUSD)
  factory.txCount = factory.txCount.plus(ONE_BI)

  // save entities
  pair.save()
  token0.save()
  token1.save()
  factory.save()

  let transaction = Transaction.load(event.transaction.hash.toHexString())
  if (transaction === null) {
    transaction = new Transaction(event.transaction.hash.toHexString())
    transaction.blockNumber = event.block.number
    transaction.timestamp = event.block.timestamp
    transaction.mints = []
    transaction.swaps = []
    transaction.burns = []
  }
  const swaps = transaction.swaps
  const swap = new Swap(
    event.transaction.hash
      .toHexString()
      .concat('-')
      .concat(BigInt.fromI32(swaps.length).toString())
  )

  // update swap event
  swap.transaction = transaction.id
  swap.pair = pair.id
  swap.timestamp = transaction.timestamp
  swap.transaction = transaction.id
  swap.sender = event.params.sender
  swap.amount0In = amount0In
  swap.amount1In = amount1In
  swap.amount0Out = amount0Out
  swap.amount1Out = amount1Out
  swap.to = event.params.to
  swap.from = event.transaction.from
  swap.logIndex = event.logIndex
  // use the tracked amount if we have it
  swap.amountUSD = trackedAmountUSD === ZERO_BD ? derivedAmountUSD : trackedAmountUSD
  swap.save()

  // update the transaction

  // TODO: Consider using .concat() for handling array updates to protect
  // against unintended side effects for other code paths.
  swaps.push(swap.id)
  transaction.swaps = swaps
  transaction.save()

  handleSync(factory, pair, token0, token1)

  // update day entities
  const pairDayData = updatePairDayData(event)
  const pairHourData = updatePairHourData(event)
  const dayData = updateDayData(event)
  const token0DayData = updateTokenDayData(token0, event)
  const token1DayData = updateTokenDayData(token1, event)

  // swap specific updating
  dayData.dailyVolumeUSD = dayData.dailyVolumeUSD.plus(trackedAmountUSD)
  dayData.dailyVolumeETH = dayData.dailyVolumeETH.plus(trackedAmountETH)
  dayData.dailyVolumeUntracked = dayData.dailyVolumeUntracked.plus(derivedAmountUSD)
  dayData.save()

  // swap specific updating for pair
  if (pairDayData) {
    pairDayData.dailyVolumeToken0 = pairDayData.dailyVolumeToken0.plus(amount0Total)
    pairDayData.dailyVolumeToken1 = pairDayData.dailyVolumeToken1.plus(amount1Total)
    pairDayData.dailyVolumeUSD = pairDayData.dailyVolumeUSD.plus(trackedAmountUSD)
    pairDayData.save()
  }

  // update hourly pair data
  if (pairHourData) {
    pairHourData.hourlyVolumeToken0 = pairHourData.hourlyVolumeToken0.plus(amount0Total)
    pairHourData.hourlyVolumeToken1 = pairHourData.hourlyVolumeToken1.plus(amount1Total)
    pairHourData.hourlyVolumeUSD = pairHourData.hourlyVolumeUSD.plus(trackedAmountUSD)
    pairHourData.save()
  }

  // swap specific updating for token0
  token0DayData.dailyVolumeToken = token0DayData.dailyVolumeToken.plus(amount0Total)
  token0DayData.dailyVolumeETH = token0DayData.dailyVolumeETH.plus(amount0Total.times(token0.derivedETH))
  token0DayData.dailyVolumeUSD = token0DayData.dailyVolumeUSD.plus(
    amount0Total.times(token0.derivedETH as BigDecimal).times(bundle.ethPrice)
  )
  token0DayData.save()

  // swap specific updating
  token1DayData.dailyVolumeToken = token1DayData.dailyVolumeToken.plus(amount1Total)
  token1DayData.dailyVolumeETH = token1DayData.dailyVolumeETH.plus(amount1Total.times(token1.derivedETH))
  token1DayData.dailyVolumeUSD = token1DayData.dailyVolumeUSD.plus(
    amount1Total.times(token1.derivedETH as BigDecimal).times(bundle.ethPrice)
  )
  token1DayData.save()
}
