import { Bundle } from '../generated/schema'
import { BUNDLE_ID, ZERO_BD } from './constants'

export function loadOrCreateBundle(): Bundle {
  let bundle = Bundle.load(BUNDLE_ID)
  if (!bundle) {
    bundle = createBundle()
  }

  return bundle
}

export function createBundle(): Bundle {
  const bundle = new Bundle(BUNDLE_ID)
  bundle.ethPrice = ZERO_BD

  bundle.save()

  return bundle
}
