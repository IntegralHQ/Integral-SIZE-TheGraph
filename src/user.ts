import { Address } from "@graphprotocol/graph-ts"
import { User } from "../generated/schema"
import { ZERO_BD } from "./constants"

export function createUser(address: Address): void {
  let user = User.load(address.toHexString())
  if (user === null) {
    user = new User(address.toHexString())
    user.usdSwapped = ZERO_BD
    user.save()
  }
}
