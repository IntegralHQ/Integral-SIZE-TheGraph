import { Address, BigDecimal, BigInt, TypedMap } from '@graphprotocol/graph-ts'
import { TwapFactory } from '../generated/TwapFactory/TwapFactory'
import { TwapReader } from '../generated/TwapFactory/TwapReader'
import { NETWORK } from '../config/network'

export const ZERO_BI = BigInt.fromI32(0)
export const ONE_BI = BigInt.fromI32(1)
export const BI_18 = BigInt.fromI32(18)
export const ZERO_BD = BigDecimal.fromString('0')
export const ONE_BD = BigDecimal.fromString('1')

export const BUNDLE_ID = '1'

export const WETH_DECIMALS = BI_18

export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'

export const DEFAULT_UNISWAP_V3_FEE = 500

export const UNISWAP_V2_FACTORY_KEY = 'UNISWAP_V2_FACTORY'
export const UNISWAP_V3_FACTORY_KEY = 'UNISWAP_V3_FACTORY'

// NOTE: Addresses passed as values in the blockchain events are always all lower case.
// If they are used as entity IDs, make sure to also use all lower case addresses to load them.
// Specifically, this applies to Pair entities which are dynamically created by the subgraph.
const mainnet = new TypedMap<string, string>()
mainnet.set('FACTORY', '0xc480b33ee5229de3fbdfad1d2dcd3f3bad0c56c6')
mainnet.set('WETH', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
mainnet.set('USDC', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
mainnet.set('CVX', '0x4e3fbd56cd56c3e72c1403e103b45db9da5b9d2b')
mainnet.set('WETH_USDC', '0x2fe16dd18bba26e457b7dd2080d5674312b026a2')
mainnet.set('READER', '0xb5c08263c1d2c9651ea6d91a9908460e40095f7c')
mainnet.set(UNISWAP_V2_FACTORY_KEY, '0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f')

const arbitrum = new TypedMap<string, string>()
arbitrum.set('FACTORY', '0x717ef162cf831db83c51134734a15d1ebe9e516a')
arbitrum.set('WETH', '0x82af49447d8a07e3bd95bd0d56f35241523fbab1')
arbitrum.set('USDC', '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8')
arbitrum.set('WETH_USDC', '0x4bca34ad27df83566016b55c60dd80a9eb14913b')
arbitrum.set('READER', '0xf5c1ee7be0bbe1d77158b114dc77d8a94f2fec02')
arbitrum.set(UNISWAP_V3_FACTORY_KEY, '0x1f98431c8ad98523631ae4a59f267346ea31f984')

const arbitrumGoerli = new TypedMap<string, string>()
arbitrumGoerli.set('FACTORY', '0xeae7b4c237a74df63786927aaa77511da35f6390')
arbitrumGoerli.set('WETH', '0xe39ab88f8a4777030a534146a9ca3b52bd5d43a3')
arbitrumGoerli.set('USDC', '0xa7465ca9f637cdcc16d33608d3a7899f5d4989ff')
arbitrumGoerli.set('WETH_USDC', '0xa088904cede8efb27e7e344179705150a6ae8bf2')
arbitrumGoerli.set('READER', '0x69a0cc49eabe834a5db052389e10f48f2a9ffa79')
arbitrumGoerli.set(UNISWAP_V3_FACTORY_KEY, '0x637caec2d8a6cc566571a20519e845daa370295e')

const ALL_NETWORK_CONFIG = new TypedMap<string, TypedMap<string, string>>()
ALL_NETWORK_CONFIG.set('mainnet', mainnet)
ALL_NETWORK_CONFIG.set('arbitrum-one', arbitrum)
ALL_NETWORK_CONFIG.set('arbitrum-goerli', arbitrumGoerli)

export const Config = ALL_NETWORK_CONFIG.mustGet(NETWORK)

export const factoryContract = TwapFactory.bind(Address.fromString(Config.mustGet('FACTORY')))
export const readerContract = TwapReader.bind(Address.fromString(Config.mustGet('READER')))
