# Contract Interaction Token Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a global ERC20 quick approval panel with BSC/BSC Testnet USDT presets, multi-chain localStorage-backed custom tokens, and custom token deletion on the contract interaction page.

**Architecture:** Add pure token approval helpers to `contract-interaction-utils.ts` for presets, storage parsing, fetched metadata validation, merging, deletion, and amount conversion. Extend `ContractInteractor.tsx` with per-chain token selection, address-only custom token addition, custom token removal, and approve transaction handling while preserving existing contract call behavior.

**Tech Stack:** Next.js client component, React state, ethers v6, Bun tests, browser `localStorage`.

## Global Constraints

- Do not change existing ABI argument parsing, tuple rendering, calldata preview, or write transaction semantics.
- The approval panel appears once above the function list, not inside each write function.
- Preset tokens are limited to BSC USDT and BSC Testnet USDT.
- Manual tokens are supported on any connected chain, scoped by numeric `chainId`, and persisted in `localStorage`.
- Manual tokens can be deleted; presets cannot be deleted.
- Approval spender defaults to the current contract address and remains editable.
- Validate token and spender addresses with ethers checksum normalization before sending.

---

### Task 1: Token Approval Utilities

**Files:**
- Modify: `app/components/contract-interaction-utils.ts`
- Test: `app/components/contract-interaction-utils.test.ts`

**Interfaces:**
- Produces: `COMMON_ERC20_TOKENS_BY_CHAIN`, `CONTRACT_INTERACTION_CUSTOM_ERC20_TOKENS_KEY`, `type Erc20TokenOption`, `parseCustomErc20TokenStore(value: string): Record<number, Erc20TokenOption[]>`, `serializeCustomErc20TokenStore(store: Record<number, Erc20TokenOption[]>): string`, `mergeErc20TokenOptions(presets: Erc20TokenOption[], custom: Erc20TokenOption[]): Erc20TokenOption[]`, `removeCustomErc20Token(store, chainId, address): Record<number, Erc20TokenOption[]>`, `createCustomErc20Token(input): Erc20TokenOption`, `parseErc20ApprovalAmount(amountText: string, decimals: number, useMax: boolean): bigint`.

- [ ] **Step 1: Write failing tests**

Add tests that expect invalid JSON storage to return `{}`, custom tokens to be normalized by chain, duplicate custom tokens to override preset labels for the same address, manual token creation to checksum addresses and reject invalid decimals, and approval amount parsing to support decimal units plus max `uint256`.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `bun test app/components/contract-interaction-utils.test.ts`
Expected: FAIL because the new utility exports do not exist.

- [ ] **Step 3: Implement utilities**

Add static presets only for BSC USDT and BSC Testnet USDT. Implement strict validation and deterministic merge ordering.

- [ ] **Step 4: Run focused tests**

Run: `bun test app/components/contract-interaction-utils.test.ts`
Expected: PASS.

### Task 2: Contract Interaction Approval Panel

**Files:**
- Modify: `app/components/ContractInteractor.tsx`

**Interfaces:**
- Consumes: Token utility exports from Task 1.
- Produces: One `ERC20 快捷授权` panel above the function list and `handleApproveErc20Token(signature: string)`.

- [ ] **Step 1: Wire state and persistence**

Track selected token by chain, custom-token address input, approval amount mode, spender input, approval loading, messages, and hashes. Load custom tokens from `localStorage` on mount and persist after manual adds or deletes.

- [ ] **Step 2: Add approval handler**

Validate wallet, selected token, spender, amount, and token contract code; request accounts; call `approve(spender, amount)` with signer; show hash and confirmation/error message. For custom token addition, validate address and contract code, then read `symbol()` and `decimals()` before saving.

- [ ] **Step 3: Render panel**

Place the panel above the function list. Show token selector with an inline delete icon on custom token rows, address-only add-token control, spender, amount, max button, approve button, status text, and approval hash.

- [ ] **Step 4: Run build verification**

Run: `bun run build`
Expected: PASS.

### Task 3: Final Verification

**Files:**
- Check: `app/components/contract-interaction-utils.test.ts`
- Check: `app/components/ContractInteractor.tsx`

- [ ] **Step 1: Run focused test**

Run: `bun test app/components/contract-interaction-utils.test.ts`
Expected: PASS.

- [ ] **Step 2: Run production build**

Run: `bun run build`
Expected: PASS.

- [ ] **Step 3: Check diff whitespace**

Run: `git diff --check`
Expected: no output and exit 0.
