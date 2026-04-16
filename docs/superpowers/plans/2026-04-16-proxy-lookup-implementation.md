# Proxy Lookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `Proxy 查询` page that resolves OpenZeppelin ERC-1967/Transparent and Beacon proxy implementation addresses from a user-provided RPC URL and proxy address.

**Architecture:** Add a focused route, client component, and utility module. The utility module owns deterministic constants and parsing helpers; the component owns validation, RPC calls, state, and rendering. Navigation is extended through the existing `AppShell` nav list.

**Tech Stack:** Next.js App Router, React client components, Tailwind CSS, `ethers` v6, `bun:test`.

---

## File Structure

- Create: `app/components/proxy-lookup-utils.ts`
  - Owns proxy mode types, ERC-1967 slot constants, beacon ABI, address normalization, slot validation, slot-to-address extraction, and result row types.
- Create: `app/components/proxy-lookup-utils.test.ts`
  - Covers deterministic helper behavior with `bun:test`.
- Create: `app/components/ProxyLookup.tsx`
  - Owns form state, mode selection, RPC reads, beacon call, loading/error states, result rendering, clear, and copy.
- Create: `app/proxy-lookup/page.tsx`
  - Wraps `ProxyLookup` in `AppShell`.
- Modify: `app/components/AppShell.tsx`
  - Adds `Proxy 查询` to the sidebar.

## Task 1: Utility Tests

**Files:**
- Create: `app/components/proxy-lookup-utils.test.ts`
- Later implementation: `app/components/proxy-lookup-utils.ts`

- [ ] **Step 1: Write failing utility tests**

Create `app/components/proxy-lookup-utils.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import {
  BEACON_ABI,
  BEACON_SLOT,
  IMPLEMENTATION_SLOT,
  addressFromStorageSlot,
  isEmptySlot,
  normalizeAddressInput,
} from "./proxy-lookup-utils";

describe("proxy-lookup-utils", () => {
  test("exports the ERC-1967 implementation slot", () => {
    expect(IMPLEMENTATION_SLOT).toBe(
      "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
    );
  });

  test("exports the ERC-1967 beacon slot", () => {
    expect(BEACON_SLOT).toBe(
      "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50",
    );
  });

  test("exports the standard beacon implementation ABI", () => {
    expect(BEACON_ABI).toEqual(["function implementation() view returns (address)"]);
  });

  test("normalizes an address with a missing 0x prefix", () => {
    expect(
      normalizeAddressInput("000000000000000000000000000000000000dead"),
    ).toBe("0x000000000000000000000000000000000000dEaD");
  });

  test("normalizes whitespace around an address", () => {
    expect(
      normalizeAddressInput("  0x000000000000000000000000000000000000dEaD  "),
    ).toBe("0x000000000000000000000000000000000000dEaD");
  });

  test("returns an empty string for empty address input", () => {
    expect(normalizeAddressInput("   ")).toBe("");
  });

  test("rejects invalid address input", () => {
    expect(() => normalizeAddressInput("0x1234")).toThrow("请输入有效的地址");
  });

  test("detects empty bytes32 storage slots", () => {
    expect(isEmptySlot(`0x${"0".repeat(64)}`)).toBe(true);
  });

  test("detects non-empty bytes32 storage slots", () => {
    expect(
      isEmptySlot(`0x${"0".repeat(24)}000000000000000000000000000000000000dead`),
    ).toBe(false);
  });

  test("extracts a checksummed address from a storage slot", () => {
    expect(
      addressFromStorageSlot(
        `0x${"0".repeat(24)}000000000000000000000000000000000000dead`,
      ),
    ).toBe("0x000000000000000000000000000000000000dEaD");
  });

  test("rejects malformed storage slot values", () => {
    expect(() => addressFromStorageSlot("0x1234")).toThrow(
      "Storage slot 必须是 bytes32",
    );
  });

  test("rejects storage slot values with non-hex characters", () => {
    expect(() => addressFromStorageSlot(`0x${"z".repeat(64)}`)).toThrow(
      "Storage slot 必须是有效的 hex",
    );
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
bun test app/components/proxy-lookup-utils.test.ts
```

Expected: FAIL because `./proxy-lookup-utils` does not exist.

## Task 2: Utility Implementation

**Files:**
- Create: `app/components/proxy-lookup-utils.ts`
- Test: `app/components/proxy-lookup-utils.test.ts`

- [ ] **Step 1: Implement deterministic helpers**

Create `app/components/proxy-lookup-utils.ts`:

```ts
import { getAddress } from "ethers";

export type ProxyMode = "erc1967" | "beacon";

export type ProxyLookupResultRow = {
  label: string;
  value: string;
  copyable?: boolean;
};

export type ProxyLookupResult = {
  mode: ProxyMode;
  proxyAddress: string;
  implementationAddress: string;
  rows: ProxyLookupResultRow[];
};

export const IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

export const BEACON_SLOT =
  "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";

export const BEACON_ABI = ["function implementation() view returns (address)"];

const BYTES32_HEX_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export const normalizeAddressInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const normalized = trimmed.startsWith("0x") || trimmed.startsWith("0X")
    ? trimmed
    : `0x${trimmed}`;

  try {
    return getAddress(normalized);
  } catch {
    throw new Error("请输入有效的地址");
  }
};

export const ensureBytes32StorageSlot = (value: string) => {
  const trimmed = value.trim();

  if (!trimmed.startsWith("0x") && !trimmed.startsWith("0X")) {
    throw new Error("Storage slot 必须是 bytes32");
  }

  if (trimmed.length !== 66) {
    throw new Error("Storage slot 必须是 bytes32");
  }

  if (!BYTES32_HEX_PATTERN.test(trimmed)) {
    throw new Error("Storage slot 必须是有效的 hex");
  }

  return `0x${trimmed.slice(2).toLowerCase()}`;
};

export const isEmptySlot = (value: string) => {
  const normalized = ensureBytes32StorageSlot(value);
  return /^0x0{64}$/.test(normalized);
};

export const addressFromStorageSlot = (value: string) => {
  const normalized = ensureBytes32StorageSlot(value);
  const addressBody = normalized.slice(-40);
  return getAddress(`0x${addressBody}`);
};
```

- [ ] **Step 2: Run utility tests**

Run:

```bash
bun test app/components/proxy-lookup-utils.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit utility layer**

Run:

```bash
git add app/components/proxy-lookup-utils.ts app/components/proxy-lookup-utils.test.ts
git commit -m "feat: add proxy lookup utilities"
```

## Task 3: Client Component

**Files:**
- Create: `app/components/ProxyLookup.tsx`
- Uses: `app/components/proxy-lookup-utils.ts`

- [ ] **Step 1: Implement the `ProxyLookup` component**

Create `app/components/ProxyLookup.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Contract, JsonRpcProvider } from "ethers";
import {
  BEACON_ABI,
  BEACON_SLOT,
  IMPLEMENTATION_SLOT,
  ProxyLookupResult,
  ProxyLookupResultRow,
  ProxyMode,
  addressFromStorageSlot,
  isEmptySlot,
  normalizeAddressInput,
} from "./proxy-lookup-utils";

const modeLabels: Record<ProxyMode, string> = {
  erc1967: "ERC1967 / Transparent",
  beacon: "Beacon",
};

const ensureRpcUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("请输入 Chain RPC");
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Chain RPC 需要是 http(s) URL");
    }
    return trimmed;
  } catch (error) {
    if (error instanceof Error && error.message === "Chain RPC 需要是 http(s) URL") {
      throw error;
    }
    throw new Error("请输入有效的 Chain RPC URL");
  }
};

const ResultRow = ({
  row,
  onCopy,
}: {
  row: ProxyLookupResultRow;
  onCopy: (value: string, label: string) => void;
}) => (
  <div className="grid gap-2 border-b border-slate-100 py-3 last:border-b-0 md:grid-cols-[220px_minmax(0,1fr)_auto] md:items-center">
    <div className="text-sm font-semibold text-slate-600">{row.label}</div>
    <div className="break-all rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
      {row.value}
    </div>
    {row.copyable ? (
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
        onClick={() => onCopy(row.value, row.label)}
        aria-label={`复制${row.label}`}
        title={`复制${row.label}`}
      >
        <svg
          aria-hidden="true"
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
          />
          <rect x="8" y="2" width="8" height="4" rx="1" />
        </svg>
      </button>
    ) : (
      <span className="hidden h-9 w-9 md:block" />
    )}
  </div>
);

const ProxyLookup = () => {
  const [rpcUrl, setRpcUrl] = useState("");
  const [proxyInput, setProxyInput] = useState("");
  const [mode, setMode] = useState<ProxyMode>("erc1967");
  const [result, setResult] = useState<ProxyLookupResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleCopy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage(`${label}已复制`);
    } catch {
      setCopyMessage("复制失败，请检查浏览器权限");
    }
  };

  const handleClear = () => {
    setRpcUrl("");
    setProxyInput("");
    setMode("erc1967");
    setResult(null);
    setErrorMessage("");
    setCopyMessage("");
    setIsLoading(false);
  };

  const resolveProxy = async () => {
    setIsLoading(true);
    setErrorMessage("");
    setResult(null);
    setCopyMessage("");

    try {
      const normalizedRpcUrl = ensureRpcUrl(rpcUrl);
      const proxyAddress = normalizeAddressInput(proxyInput);
      if (!proxyAddress) {
        throw new Error("请输入 Proxy 地址");
      }

      const provider = new JsonRpcProvider(normalizedRpcUrl);

      if (mode === "erc1967") {
        const implementationSlotValue = await provider.getStorage(
          proxyAddress,
          IMPLEMENTATION_SLOT,
        );

        if (isEmptySlot(implementationSlotValue)) {
          throw new Error("implementation slot 为空，请确认代理类型或地址");
        }

        const implementationAddress = addressFromStorageSlot(implementationSlotValue);
        setResult({
          mode,
          proxyAddress,
          implementationAddress,
          rows: [
            { label: "Proxy 地址", value: proxyAddress, copyable: true },
            { label: "代理类型", value: modeLabels[mode] },
            { label: "ERC1967 implementation slot", value: IMPLEMENTATION_SLOT },
            { label: "最终 Implementation 地址", value: implementationAddress, copyable: true },
          ],
        });
        return;
      }

      const beaconSlotValue = await provider.getStorage(proxyAddress, BEACON_SLOT);
      if (isEmptySlot(beaconSlotValue)) {
        throw new Error("beacon slot 为空，请确认代理类型或地址");
      }

      const beaconAddress = addressFromStorageSlot(beaconSlotValue);
      const beacon = new Contract(beaconAddress, BEACON_ABI, provider);
      let implementationAddress: string;

      try {
        implementationAddress = normalizeAddressInput(await beacon.implementation());
      } catch {
        throw new Error("调用 beacon implementation() 失败");
      }

      setResult({
        mode,
        proxyAddress,
        implementationAddress,
        rows: [
          { label: "Proxy 地址", value: proxyAddress, copyable: true },
          { label: "代理类型", value: modeLabels[mode] },
          { label: "ERC1967 beacon slot", value: BEACON_SLOT },
          { label: "Beacon 地址", value: beaconAddress, copyable: true },
          {
            label: "Beacon implementation() 返回值",
            value: implementationAddress,
            copyable: true,
          },
          { label: "最终 Implementation 地址", value: implementationAddress, copyable: true },
        ],
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "查询失败，请检查 RPC 和地址");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <div className="fade-up space-y-3">
        <span className="text-xs uppercase tracking-[0.35em] text-slate-500">
          EVM Toolkit
        </span>
        <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">
          Proxy 查询
        </h1>
        <p className="max-w-3xl text-sm text-slate-600 md:text-base">
          输入 Chain RPC 和代理地址，按 OpenZeppelin ERC-1967 标准查询 implementation。
        </p>
      </div>

      <section className="fade-up-delay rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">代理实现查询</h2>
            <p className="mt-1 text-sm text-slate-500">
              手动选择 ERC1967 / Transparent 或 Beacon 模式。
            </p>
          </div>
          <span className="w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
            ERC-1967 slots
          </span>
        </div>

        <div className="grid gap-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Chain RPC
            </label>
            <input
              type="url"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
              value={rpcUrl}
              onChange={(event) => setRpcUrl(event.target.value)}
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Proxy 地址
            </label>
            <input
              type="text"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
              value={proxyInput}
              onChange={(event) => setProxyInput(event.target.value)}
              placeholder="请输入 Proxy 地址 (0x...)"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              代理类型
            </label>
            <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
              {(["erc1967", "beacon"] as ProxyMode[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    mode === item
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                  onClick={() => setMode(item)}
                >
                  {modeLabels[item]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-5 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            onClick={resolveProxy}
            disabled={isLoading}
          >
            {isLoading ? "查询中..." : "查询"}
          </button>
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
            onClick={handleClear}
          >
            清空
          </button>
        </div>

        {copyMessage && <div className="mt-3 text-xs text-slate-500">{copyMessage}</div>}
      </section>

      {result && (
        <section className="fade-up-delay rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">解析链路</h2>
              <p className="mt-1 text-sm text-slate-500">
                最终 implementation 来自 {modeLabels[result.mode]} 查询路径。
              </p>
            </div>
            <button
              type="button"
              className="w-fit rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
              onClick={() => handleCopy(result.implementationAddress, "最终 Implementation 地址")}
            >
              复制 Implementation
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 px-4">
            {result.rows.map((row) => (
              <ResultRow key={row.label} row={row} onCopy={handleCopy} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default ProxyLookup;
```

- [ ] **Step 2: Run type-aware build**

Run:

```bash
bun run build
```

Expected: build succeeds, or fails only on issues introduced by this task that should be fixed before continuing.

- [ ] **Step 3: Commit client component**

Run:

```bash
git add app/components/ProxyLookup.tsx
git commit -m "feat: add proxy lookup interface"
```

## Task 4: Route and Navigation

**Files:**
- Create: `app/proxy-lookup/page.tsx`
- Modify: `app/components/AppShell.tsx`

- [ ] **Step 1: Add the page route**

Create `app/proxy-lookup/page.tsx`:

```tsx
import AppShell from "../components/AppShell";
import ProxyLookup from "../components/ProxyLookup";

export default function ProxyLookupPage() {
  return (
    <AppShell>
      <ProxyLookup />
    </AppShell>
  );
}
```

- [ ] **Step 2: Add sidebar navigation**

Modify `app/components/AppShell.tsx` so `navItems` includes `Proxy 查询` after `合约交互`:

```ts
const navItems: NavItem[] = [
  { name: "交易解码", href: "/" },
  { name: "转换", href: "/address" },
  { name: "Time", href: "/time" },
  { name: "JSON 格式化", href: "/json-formatter" },
  { name: "合约地址", href: "/contract-address" },
  { name: "合约交互", href: "/contract-interaction" },
  { name: "Proxy 查询", href: "/proxy-lookup" },
  { name: "ABI 管理", href: "/abi-manager" },
  { name: "Selector 映射", href: "/abi-selectors" },
];
```

- [ ] **Step 3: Run build**

Run:

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 4: Commit route and nav**

Run:

```bash
git add app/proxy-lookup/page.tsx app/components/AppShell.tsx
git commit -m "feat: add proxy lookup route"
```

## Task 5: Final Verification

**Files:**
- Verify: all changed files

- [ ] **Step 1: Run focused tests**

Run:

```bash
bun test app/components/proxy-lookup-utils.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run related existing tests**

Run:

```bash
bun test app/components/address-converter-utils.test.ts app/components/contract-interaction-utils.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run production build**

Run:

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 4: Start local dev server for manual verification**

Run:

```bash
bun run dev
```

Expected: Next.js starts and prints a local URL, usually `http://localhost:3000`.

- [ ] **Step 5: Manually verify the UI**

Open `/proxy-lookup` in the browser and verify:

- the sidebar contains `Proxy 查询`
- empty RPC shows `请输入 Chain RPC`
- invalid RPC shows `请输入有效的 Chain RPC URL` or `Chain RPC 需要是 http(s) URL`
- invalid proxy address shows `请输入有效的地址`
- selecting `ERC1967 / Transparent` shows the implementation slot in the result after a successful query
- selecting `Beacon` shows the beacon slot, beacon address, beacon implementation value, and final implementation after a successful query
- `复制 Implementation` copies the final implementation address
- narrow viewport keeps fields and result rows readable

- [ ] **Step 6: Commit any verification fixes**

If manual verification requires small fixes, commit them:

```bash
git add app/components/ProxyLookup.tsx app/components/AppShell.tsx app/proxy-lookup/page.tsx app/components/proxy-lookup-utils.ts app/components/proxy-lookup-utils.test.ts
git commit -m "fix: polish proxy lookup verification issues"
```

## Self-Review

- Spec coverage: The plan covers sidebar navigation, `/proxy-lookup`, RPC and proxy inputs, manual mode selection, ERC-1967/Transparent lookup, Beacon lookup, full result chain display, deterministic utility tests, and final verification.
- Placeholder scan: No placeholder markers or incomplete implementation steps remain.
- Type consistency: `ProxyMode`, `ProxyLookupResult`, `ProxyLookupResultRow`, `IMPLEMENTATION_SLOT`, `BEACON_SLOT`, `BEACON_ABI`, `normalizeAddressInput`, `isEmptySlot`, and `addressFromStorageSlot` are consistently named across tasks.
