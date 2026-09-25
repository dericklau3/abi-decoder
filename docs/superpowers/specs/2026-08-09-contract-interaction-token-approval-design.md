# Contract Interaction Token Approval Design

## Goal

Add an ERC20 quick approval panel to the contract interaction page so a user can approve a selected token for the current target contract before calling write functions.

## Scope

- Show BSC and BSC Testnet USDT presets only when those chains are connected.
- Allow the user to manually add ERC20 tokens for any connected chain.
- Allow the user to delete manually added ERC20 tokens without deleting presets.
- Persist manually added tokens in `localStorage` so they survive page refreshes.
- Default the approval spender to the current contract address, while allowing manual override.
- Send `approve(address,uint256)` from the selected token contract with the connected wallet.
- Keep the existing ABI selection, argument rendering, calldata preview, and transaction sending behavior unchanged.

## Data Model

- Preset tokens are static records keyed by numeric `chainId`; the initial scope is BSC `56` and BSC Testnet `97`.
- Custom tokens are stored under `contractInteractionCustomErc20Tokens:v1` as a JSON object keyed by `chainId`.
- A token record contains `chainId`, `symbol`, `address`, and `decimals`.
- Preset and custom tokens are merged by checksum address; custom tokens can add new entries without mutating presets.
- Deleting a custom token removes only that chain's matching custom address from local storage.

## UI

- A single `ERC20 快捷授权` panel appears above the function list.
- The panel includes token selection, inline delete icons for custom-token rows, one address-only manual token add control, spender input, amount input, unit display, a max-approval shortcut, and an approval button.
- Manual token add reads `symbol()` and `decimals()` from the token contract before persisting it.
- The selected token list follows the current wallet chain. If the wallet is not connected or the current chain has no preset/custom tokens, the panel shows that state without blocking normal contract calls.

## Errors

- Invalid token address, missing token contract code, failed token metadata reads, invalid spender address, or invalid amount is reported in the approval panel.
- Missing wallet prompts the existing wallet connection flow.
- A missing token contract on the current chain is reported before sending the approve transaction.

## Tests

- Unit tests cover custom token storage parsing, token merging, fetched token metadata validation, custom token removal, approve amount parsing, and the BSC/BSC Testnet USDT preset scope.
