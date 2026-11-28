import type { DemoAddress } from './demo'
import type { DemoRecipient } from './demo-domain'
import { springRequest } from './spring-api'

export interface SpringAddressBook {
  revision: number
  addresses: DemoAddress[]
  defaultAddressId: string | null
}

interface AddressChange {
  book: SpringAddressBook
  savedAddressId: string
}

const path = '/orders/addresses'

export function requestLegacyAddress(token: string, recipient: DemoRecipient) {
  return springRequest<AddressChange>(`${path}/import`, 'POST', token, { ...recipient })
}

export function requestAddressSave(
  token: string,
  recipient: DemoRecipient,
  makeDefault: boolean,
  id?: string,
  operationId?: string,
) {
  return springRequest<AddressChange>(
    id ? `${path}/${encodeURIComponent(id)}` : path,
    id ? 'PUT' : 'POST',
    token,
    { recipient, makeDefault },
    operationId,
  )
}

export function requestAddressAction(token: string, id: string, action: 'default' | 'delete') {
  const address = `${path}/${encodeURIComponent(id)}`
  return action === 'default'
    ? springRequest<SpringAddressBook>(`${address}/default`, 'PUT', token)
    : springRequest<SpringAddressBook>(address, 'DELETE', token)
}
