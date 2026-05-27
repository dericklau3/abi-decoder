# StorageLayout Design

## Goal

Add a `StorageLayout` tool that lets users paste or upload a Solidity `storage-layout.json`, provide an RPC URL and contract address, then read internal/private contract state directly from storage slots.

## Scope

The first version supports standard Solidity storage layout JSON with a top-level `storage` array and `types` map. It reads values through `eth_getStorageAt` using an RPC URL entered on the page, without requiring a connected wallet.

The tool supports:

- In-place primitive values such as `address`, `bool`, `uint*`, `int*`, `bytes32`, fixed bytes, and packed fields that use `offset`.
- `mapping` and nested `mapping` values by asking the user for each key.
- Dynamic arrays by asking the user for an index.
- Static arrays when present in compiler output.
- Struct fields, including struct fields that are themselves mappings, arrays, or packed primitive values.
- Storage strings and bytes, including short in-slot values and long values stored at `keccak256(slot)`.

## User Flow

1. User opens `/storage-layout` from the sidebar.
2. User enters RPC URL and contract address.
3. User pastes JSON or uploads a `storage-layout.json` file.
4. Page parses the layout and lists storage variables with label, type, slot, offset, and contract.
5. User selects a variable.
6. The page walks the selected variable's type:
   - Primitive values can be read immediately.
   - Mappings request typed keys.
   - Arrays request numeric indexes.
   - Structs request a field selection and continue walking that field type.
7. User clicks read.
8. The page shows the path expression, computed slot, raw 32-byte storage word, and decoded value.

## Architecture

Create a pure utility module for layout parsing, slot path resolution, key encoding, and raw storage decoding. The React component keeps UI state and uses ethers `JsonRpcProvider` for reads. Keeping storage math outside React makes mapping/array/struct behavior testable without RPC.

## Error Handling

The page shows actionable errors for invalid JSON, invalid contract address, missing RPC URL, unsupported or malformed layout types, missing mapping keys or array indexes, invalid key values, and RPC failures. Unsupported types are reported at the selected path without crashing the page.

## Testing

Unit tests cover:

- Parsing a Solidity storage layout.
- Resolving plain slots and packed offsets.
- Resolving single and nested mapping slots.
- Resolving struct fields and nested struct mapping fields.
- Resolving dynamic array element slots.
- Decoding common primitive values.
- Decoding short storage strings.

UI verification covers build success and manual page load through the local Next.js dev server.
