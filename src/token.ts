import { Address, log, BigInt } from "@graphprotocol/graph-ts"
import { Token } from "../generated/schema"
import { ZERO_BD, ZERO_BI } from "./constants"
import { TokenDefinition } from "./tokenDefinition"
import { ERC20 } from "../generated/TwapFactory/ERC20"
import { ERC20NameBytes } from "../generated/TwapFactory/ERC20NameBytes"
import { ERC20SymbolBytes } from "../generated/TwapFactory/ERC20SymbolBytes"

function isNullEthValue(value: string): boolean {
  return value == '0x0000000000000000000000000000000000000000000000000000000000000001'
}

function fetchTokenSymbol(tokenAddress: Address): string {
  const staticDefinition = TokenDefinition.fromAddress(tokenAddress)
  if (staticDefinition) {
      return staticDefinition.symbol
  }

  const contract = ERC20.bind(tokenAddress)

  // try types string and bytes32 for symbol
  let retVal = 'unknown'
  
  const symbolResult = contract.try_symbol()
  if (symbolResult.reverted) {
    const contractSymbolBytes = ERC20SymbolBytes.bind(tokenAddress)
    const symbolResultBytes = contractSymbolBytes.try_symbol()
    if (!symbolResultBytes.reverted) {
      // for broken pairs that have no symbol function exposed
      if (!isNullEthValue(symbolResultBytes.value.toHexString())) {
        retVal = symbolResultBytes.value.toString()
      }
    }
  } else {
    retVal = symbolResult.value
  }

  return retVal
}
  
function fetchTokenName(tokenAddress: Address): string {
  const staticDefinition = TokenDefinition.fromAddress(tokenAddress)
  if(staticDefinition != null) {
    return (staticDefinition as TokenDefinition).name
  }

  const contract = ERC20.bind(tokenAddress)
  const contractNameBytes = ERC20NameBytes.bind(tokenAddress)

  // try types string and bytes32 for name
  let retVal = 'unknown'
  const nameResult = contract.try_name()
  if (nameResult.reverted) {
    const nameResultBytes = contractNameBytes.try_name()
    if (!nameResultBytes.reverted) {
      // for broken exchanges that have no name function exposed
      if (!isNullEthValue(nameResultBytes.value.toHexString())) {
        retVal = nameResultBytes.value.toString()
      }
    }
  } else {
    retVal = nameResult.value
  }

  return retVal
}

function fetchTokenTotalSupply(tokenAddress: Address): BigInt | null {
  const contract = ERC20.bind(tokenAddress)
  const totalSupplyResult = contract.try_totalSupply()
  if (!totalSupplyResult.reverted) {
    return totalSupplyResult.value
  }

  return null
}

function fetchTokenDecimals(tokenAddress: Address): BigInt | null {
  const staticDefinition = TokenDefinition.fromAddress(tokenAddress)
  if(staticDefinition != null) {
    return staticDefinition.decimals
  }

  const contract = ERC20.bind(tokenAddress)
  // try types uint8 for decimals
  const decimalResult = contract.try_decimals()
  if (!decimalResult.reverted) {
    return BigInt.fromI32(decimalResult.value)
  }

  return null
}

export function loadOrCreateToken(tokenAddress: Address): Token | null {
  let token = Token.load(tokenAddress.toHexString())
  if (token === null) {
    token = new Token(tokenAddress.toHexString())
    token.symbol = fetchTokenSymbol(tokenAddress)
    token.name = fetchTokenName(tokenAddress)

    const totalSupply = fetchTokenTotalSupply(tokenAddress)
    if (totalSupply === null) {
      log.warning('Cannot determine total supply for token {}', [tokenAddress.toHexString()])
      return null
    }
    token.totalSupply = totalSupply

    const decimals = fetchTokenDecimals(tokenAddress)
    if (decimals === null) {
      log.warning('Cannot determine decimals for token {}', [tokenAddress.toHexString()])
      return null
    }
    token.decimals = decimals

    token.derivedETH = ZERO_BD
    token.tradeVolume = ZERO_BD
    token.tradeVolumeUSD = ZERO_BD
    token.untrackedVolumeUSD = ZERO_BD
    token.totalLiquidity = ZERO_BD
    token.txCount = ZERO_BI
  }

  return token
}
