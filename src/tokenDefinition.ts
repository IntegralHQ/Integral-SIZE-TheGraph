import { Address, BigInt } from '@graphprotocol/graph-ts'
import { Config } from './constants'

// Initialize a Token Definition with the attributes
export class TokenDefinition {
  address: Address
  symbol: string
  name: string
  decimals: BigInt

  // Initialize a Token Definition with its attributes
  constructor(address: Address, symbol: string, name: string, decimals: BigInt) {
    this.address = address
    this.symbol = symbol
    this.name = name
    this.decimals = decimals
  }

  // Get all tokens with a static defintion
  static getStaticDefinitions(): Array<TokenDefinition> {
    const staticDefinitions = new Array<TokenDefinition>()

    staticDefinitions.push(
      new TokenDefinition(Address.fromString(Config.mustGet('USDC')), 'USDC', 'USD Coin', BigInt.fromI32(6))
    )
    staticDefinitions.push(
      new TokenDefinition(Address.fromString(Config.mustGet('WETH')), 'WETH', 'WETH', BigInt.fromI32(18))
    )
    if (Config.isSet('CVX')) {
      staticDefinitions.push(
        new TokenDefinition(Address.fromString(Config.mustGet('CVX')), 'CVX', 'Convex Token', BigInt.fromI32(18))
      )
    }
    if (Config.isSet('USDC.e')) {
      staticDefinitions.push(
        new TokenDefinition(Address.fromString(Config.mustGet('USDC.e')), 'USDC.e', 'Bridged USDC', BigInt.fromI32(6))
      )
    }

    return staticDefinitions
  }

  // Helper for hardcoded tokens
  static fromAddress(tokenAddress: Address): TokenDefinition | null {
    const staticDefinitions = this.getStaticDefinitions()
    const tokenAddressHex = tokenAddress.toHexString()

    // Search the definition using the address
    for (let i = 0; i < staticDefinitions.length; i++) {
      const staticDefinition = staticDefinitions[i]
      if (staticDefinition.address.toHexString() == tokenAddressHex) {
        return staticDefinition
      }
    }

    // If not found, return null
    return null
  }
}
