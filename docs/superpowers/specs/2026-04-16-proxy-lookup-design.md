# Proxy Lookup Design

## Goal

Add a `Proxy 查询` tool to the EVM Toolkit sidebar. The tool lets a user enter a chain RPC URL, a proxy contract address, and a proxy mode, then resolves the OpenZeppelin implementation address through the standard ERC-1967 storage slots.

## Existing Context

- The app uses Next.js pages under `app/` and shared client components under `app/components/`.
- The left navigation is defined in `app/components/AppShell.tsx`.
- Existing tools follow a route plus component pattern, for example `app/contract-address/page.tsx` and `app/components/ContractAddressCalculator.tsx`.
- The project already depends on `ethers` and `viem`, so no new dependency is needed for RPC reads.
- Utility files and focused tests already exist for several tools, such as `contract-interaction-utils.ts` and `address-converter-utils.test.ts`.

## User Problem

Many contracts use OpenZeppelin proxy patterns. When inspecting a proxy, the user wants to quickly find the implementation contract without manually calculating storage slots or calling the beacon contract.

The tool should support two manually selected modes:

- `ERC1967 / Transparent`
- `Beacon`

## Scope

This enhancement covers:

- adding a `Proxy 查询` item to the sidebar
- adding a `/proxy-lookup` page
- accepting a chain RPC URL and proxy address
- manually selecting proxy type
- resolving the implementation address for standard ERC-1967 and Transparent proxies
- resolving the beacon address and final implementation for standard Beacon proxies
- showing the full resolution chain in the result view
- adding focused unit tests for deterministic parsing helpers

This enhancement does not include:

- automatic proxy type detection
- wallet connection or signing
- fetching ABIs or source code from explorers
- support for non-standard storage layouts
- recursive proxy resolution if the implementation is itself a proxy
- modifying the existing contract interaction flow

## Recommended Approach

### Option A: Put all logic in the page component

Pros:

- smallest number of files
- fastest initial implementation

Cons:

- mixes UI state, RPC calls, and storage parsing
- harder to test core parsing behavior
- less consistent with the existing utility/test pattern

### Option B: Split utilities from the UI component

Pros:

- matches existing project patterns
- keeps slot constants and address parsing easy to review
- makes deterministic logic unit-testable without a live RPC
- leaves room for future additions such as auto-detection or admin slot display

Cons:

- adds one extra utility file and one extra test file

### Option C: Build a shared RPC abstraction first

Pros:

- could later be reused across more chain-reading tools

Cons:

- larger than this feature needs
- introduces abstraction before the app has enough repeated RPC-reading code to justify it

The recommended approach is Option B.

## UX Design

The sidebar adds a `Proxy 查询` item. The page title is also `Proxy 查询`.

The page contains one main query panel with:

- `Chain RPC` text input
- `Proxy 地址` text input
- proxy mode segmented control with `ERC1967 / Transparent` and `Beacon`
- `查询` button
- `清空` button

The result area displays a complete resolution chain.

For `ERC1967 / Transparent`:

- Proxy 地址
- 代理类型
- ERC1967 implementation slot
- 最终 Implementation 地址

For `Beacon`:

- Proxy 地址
- 代理类型
- ERC1967 beacon slot
- Beacon 地址
- Beacon implementation() 返回值
- 最终 Implementation 地址

The result should favor copyable, scan-friendly address rows. The primary copy action should copy the final implementation address.

## Technical Design

### Route and Component

Add `app/proxy-lookup/page.tsx` as the route entry. It renders a `ProxyLookup` client component.

Add `app/components/ProxyLookup.tsx` to manage:

- form state
- selected proxy mode
- loading state
- validation errors
- RPC failures
- result rendering
- clear and copy actions

### Utility Module

Add `app/components/proxy-lookup-utils.ts` for deterministic logic:

- proxy mode type
- ERC-1967 implementation slot constant
- ERC-1967 beacon slot constant
- beacon ABI fragment for `implementation()`
- `normalizeAddressInput(value)`
- `isEmptySlot(value)`
- `addressFromStorageSlot(value)`
- result types used by the UI

The ERC-1967 implementation slot is:

`0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`

The ERC-1967 beacon slot is:

`0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50`

`TransparentUpgradeableProxy`, `ERC1967Proxy`, and UUPS-style ERC-1967 proxies all use the same implementation slot for this feature, so they share one mode.

### RPC Flow

For `ERC1967 / Transparent` mode:

1. Normalize and checksum the proxy address.
2. Create an `ethers.JsonRpcProvider` from the RPC URL.
3. Read the implementation slot with `provider.getStorage(proxy, IMPLEMENTATION_SLOT)`.
4. Treat an all-zero slot as "implementation not found".
5. Extract the last 20 bytes as the implementation address.
6. Render the result chain.

For `Beacon` mode:

1. Normalize and checksum the proxy address.
2. Create an `ethers.JsonRpcProvider` from the RPC URL.
3. Read the beacon slot with `provider.getStorage(proxy, BEACON_SLOT)`.
4. Treat an all-zero slot as "beacon not found".
5. Extract the last 20 bytes as the beacon address.
6. Call `implementation()` on the beacon contract.
7. Normalize and checksum the returned implementation address.
8. Render the result chain.

## Error Handling

The UI should show a single clear error message and preserve the user's inputs.

Handle these cases:

- empty RPC URL
- invalid RPC URL
- empty proxy address
- invalid proxy address
- RPC connection or request failure
- all-zero implementation slot in `ERC1967 / Transparent` mode
- all-zero beacon slot in `Beacon` mode
- beacon `implementation()` call failure
- beacon `implementation()` returns an invalid address

Errors should not clear the last successful result unless a new query starts. Starting a new query clears the previous error and result.

## Testing Strategy

Add focused unit tests for `proxy-lookup-utils.ts`:

- address normalization accepts values with and without `0x`
- invalid addresses throw or return a validation error through the chosen helper shape
- all-zero storage slots are detected
- non-zero storage slots extract the last 20 bytes as a checksummed address
- malformed storage values are rejected

RPC behavior can be verified manually because live RPC endpoints are environment-dependent. If the implementation naturally isolates RPC calls enough for mocking without extra dependencies, add a small test for mode branching; otherwise keep automated coverage on deterministic utilities.

Manual verification should cover:

- a known ERC-1967 or Transparent proxy resolves through the implementation slot
- a known Beacon proxy resolves through beacon slot plus `implementation()`
- invalid RPC and invalid address errors are readable
- loading state prevents duplicate query clicks
- final implementation copy action works
- the page works on desktop and narrow viewports

## Success Criteria

This enhancement is successful when:

- `Proxy 查询` appears in the sidebar and opens `/proxy-lookup`
- the user can enter RPC, proxy address, and mode manually
- `ERC1967 / Transparent` mode displays the implementation slot and final implementation
- `Beacon` mode displays the beacon slot, beacon address, beacon implementation result, and final implementation
- invalid input and RPC failures produce clear errors
- deterministic parsing behavior is covered by unit tests
- existing toolkit pages and navigation continue to work unchanged
