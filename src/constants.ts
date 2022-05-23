import { Address, BigDecimal, BigInt } from "@graphprotocol/graph-ts";
import { TwapFactory } from "../generated/TwapFactory/TwapFactory";
import { TwapReader } from "../generated/TwapFactory/TwapReader";
import { UniswapFactoryV2 } from "../generated/templates/Pair/UniswapFactoryV2";

export const ZERO_BI = BigInt.fromI32(0)
export const ONE_BI = BigInt.fromI32(1)
export const BI_18 = BigInt.fromI32(18)
export const ZERO_BD = BigDecimal.fromString('0')
export const ONE_BD = BigDecimal.fromString('1')

export const BUNDLE_ID = '1'

export const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
export const WETH_DECIMALS = BI_18

export const USDC_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
export const CVX_ADDRESS = '0x4e3fbd56cd56c3e72c1403e103b45db9da5b9d2b'

// NOTE: Addresses passed as values in the blockchain events are always all lower case.
// If they are used as entity IDs, make sure to also use all lower case addresses to load them.
// Specifically, this applies to Pair entities which are dynamically created by the subgraph.
export const WETH_USDC_ADDRESS = '0x2fe16dd18bba26e457b7dd2080d5674312b026a2'

export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'
export const FACTORY_ADDRESS = '0xc480b33ee5229de3fbdfad1d2dcd3f3bad0c56c6'
export const READER_ADDRESS = '0xb5c08263c1d2c9651ea6d91a9908460e40095f7c'
export const UNISWAP_V2_FACTORY_ADDRESS = '0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f'

export const factoryContract = TwapFactory.bind(Address.fromString(FACTORY_ADDRESS))
export const readerContract = TwapReader.bind(Address.fromString(READER_ADDRESS))
export const uniswapV2FactoryContract = UniswapFactoryV2.bind(Address.fromString(UNISWAP_V2_FACTORY_ADDRESS))
