# StorageLayout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a StorageLayout page that reads internal/private Solidity storage values from user-provided storage layout JSON and RPC.

**Architecture:** Add a pure `storage-layout-utils.ts` module for parsing, path resolution, slot calculation, and decoding. Add a `StorageLayout` client component plus `/storage-layout` route, and register it in the existing `AppShell` sidebar.

**Tech Stack:** Next.js App Router, React 19, TypeScript, ethers v6, Bun test runner, Tailwind CSS.

---

## File Structure

- Create `app/components/storage-layout-utils.ts`: Storage layout types, parser, key validation, slot resolution, raw word slicing, and value decoding.
- Create `app/components/storage-layout-utils.test.ts`: Unit tests for slot calculation and decoding behavior.
- Create `app/components/StorageLayout.tsx`: Client UI for RPC/address/layout input, variable selection, path parameter input, read action, and result display.
- Create `app/storage-layout/page.tsx`: Route wrapper using `AppShell`.
- Modify `app/components/AppShell.tsx`: Add `StorageLayout` sidebar item.

## Tasks

### Task 1: Utility Tests

- [ ] Add `app/components/storage-layout-utils.test.ts` with tests for parsing, packed bool decoding, mapping slot calculation, nested mapping slot calculation, struct field resolution, dynamic array slot calculation, and short string decoding.
- [ ] Run `bun test app/components/storage-layout-utils.test.ts` and confirm the tests fail because the module does not exist yet.

### Task 2: Utility Implementation

- [ ] Add `app/components/storage-layout-utils.ts`.
- [ ] Implement `parseStorageLayout`, `createInitialSelection`, `getSelectionSteps`, `resolveStoragePath`, and `decodeStorageValue`.
- [ ] Run `bun test app/components/storage-layout-utils.test.ts` and confirm the tests pass.

### Task 3: Page UI

- [ ] Add `app/components/StorageLayout.tsx`.
- [ ] Add `app/storage-layout/page.tsx`.
- [ ] Wire file upload, JSON paste, variable selector, generated key/index/field controls, RPC read via `JsonRpcProvider.getStorage`, and output rendering.
- [ ] Add the sidebar entry in `app/components/AppShell.tsx`.

### Task 4: Verification

- [ ] Run `bun test app/components/storage-layout-utils.test.ts`.
- [ ] Run `bun run build`.
- [ ] Start `bun run dev` and inspect `/storage-layout` in the browser.
