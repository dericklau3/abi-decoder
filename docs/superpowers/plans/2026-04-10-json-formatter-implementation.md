# JSON Formatter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated `JSON 格式化` route with persistent sidebar navigation, readable structured JSON output, and hover copy actions for primitive values plus object and array subtrees.

**Architecture:** Keep the existing `AppShell` and route-per-tool pattern, add a new formatter page, and split the feature into a small pure utility module plus focused UI components. Put parsing and copy serialization rules in testable helpers first, then wire them into a client-side workspace that renders a recursive JSON tree and uses local state for parse, error, and copy feedback.

**Tech Stack:** Next.js app router, React 19 client components, TypeScript, Tailwind CSS, Bun test runner

---

### Task 1: Add JSON formatter utilities with TDD

**Files:**
- Create: `app/components/json-formatter-utils.ts`
- Create: `app/components/json-formatter-utils.test.ts`

- [ ] **Step 1: Write the failing utility tests**

```ts
import { describe, expect, test } from "bun:test";

import {
  formatJsonInput,
  serializeJsonValueForCopy,
} from "./json-formatter-utils";

describe("json-formatter-utils", () => {
  test("formats minified json into a parsed value and pretty string", () => {
    const result = formatJsonInput('{"user":{"name":"alice"},"enabled":true}');

    expect(result.pretty).toBe(
      '{\n  "user": {\n    "name": "alice"\n  },\n  "enabled": true\n}',
    );
    expect(result.value).toEqual({
      user: { name: "alice" },
      enabled: true,
    });
  });

  test("throws a readable error for invalid json", () => {
    expect(() => formatJsonInput('{"user":}')).toThrow("JSON 格式错误");
  });

  test("copies string values without quotes", () => {
    expect(serializeJsonValueForCopy("alice")).toBe("alice");
  });

  test("copies booleans and null using json literals", () => {
    expect(serializeJsonValueForCopy(true)).toBe("true");
    expect(serializeJsonValueForCopy(null)).toBe("null");
  });

  test("copies arrays and objects as pretty json", () => {
    expect(
      serializeJsonValueForCopy({
        profile: { role: "admin" },
        tags: ["a", "b"],
      }),
    ).toBe(
      '{\n  "profile": {\n    "role": "admin"\n  },\n  "tags": [\n    "a",\n    "b"\n  ]\n}',
    );
  });
});
```

- [ ] **Step 2: Run the utility test file to verify it fails**

Run: `bun test app/components/json-formatter-utils.test.ts`

Expected: FAIL with module-not-found or missing-export errors for `json-formatter-utils`

- [ ] **Step 3: Write the minimal utility implementation**

```ts
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

const INDENTATION = 2;

const normalizeParseError = (error: unknown) => {
  if (error instanceof Error && error.message.trim()) {
    return `JSON 格式错误：${error.message}`;
  }
  return "JSON 格式错误，请检查输入内容";
};

export const formatJsonInput = (input: string) => {
  try {
    const value = JSON.parse(input) as JsonValue;
    return {
      value,
      pretty: JSON.stringify(value, null, INDENTATION),
    };
  } catch (error) {
    throw new Error(normalizeParseError(error));
  }
};

export const serializeJsonValueForCopy = (value: JsonValue) => {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null) {
    return "null";
  }
  return JSON.stringify(value, null, INDENTATION);
};
```

- [ ] **Step 4: Run the utility test file again to verify it passes**

Run: `bun test app/components/json-formatter-utils.test.ts`

Expected: PASS with all tests green

- [ ] **Step 5: Commit the utility slice**

```bash
git add app/components/json-formatter-utils.ts app/components/json-formatter-utils.test.ts
git commit -m "feat: add json formatter utilities"
```

### Task 2: Add the recursive formatter UI and page route

**Files:**
- Create: `app/components/JsonFormatter.tsx`
- Create: `app/components/JsonTreeNode.tsx`
- Create: `app/json-formatter/page.tsx`
- Modify: `app/components/AppShell.tsx`
- Read for styling reference: `app/components/TransactionDecoder.tsx`
- Read for route pattern: `app/address/page.tsx`

- [ ] **Step 1: Add the new navigation item and route shell**

Update `app/components/AppShell.tsx` nav items:

```ts
const navItems: NavItem[] = [
  { name: "交易解码", href: "/" },
  { name: "转换", href: "/address" },
  { name: "合约地址", href: "/contract-address" },
  { name: "合约交互", href: "/contract-interaction" },
  { name: "ABI 管理", href: "/abi-manager" },
  { name: "Selector 映射", href: "/abi-selectors" },
  { name: "JSON 格式化", href: "/json-formatter" },
];
```

Create `app/json-formatter/page.tsx`:

```tsx
import AppShell from "../components/AppShell";
import JsonFormatter from "../components/JsonFormatter";

export default function JsonFormatterPage() {
  return (
    <AppShell>
      <JsonFormatter />
    </AppShell>
  );
}
```

- [ ] **Step 2: Build the formatter workspace component**

Create `app/components/JsonFormatter.tsx` with local state for input, parsed value, pretty output, error, and copy feedback:

```tsx
"use client";

import { useState } from "react";

import JsonTreeNode from "./JsonTreeNode";
import {
  formatJsonInput,
  serializeJsonValueForCopy,
  type JsonValue,
} from "./json-formatter-utils";

const JsonFormatter = () => {
  const [input, setInput] = useState("");
  const [parsedValue, setParsedValue] = useState<JsonValue | null>(null);
  const [prettyOutput, setPrettyOutput] = useState("");
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  const handleFormat = () => {
    try {
      const result = formatJsonInput(input);
      setParsedValue(result.value);
      setPrettyOutput(result.pretty);
      setError("");
      setCopyMessage("");
    } catch (formatError) {
      setParsedValue(null);
      setPrettyOutput("");
      setCopyMessage("");
      setError(formatError instanceof Error ? formatError.message : "JSON 格式错误");
    }
  };

  const handleClear = () => {
    setInput("");
    setParsedValue(null);
    setPrettyOutput("");
    setError("");
    setCopyMessage("");
  };

  const handleCopyAll = async () => {
    if (!prettyOutput) {
      setCopyMessage("暂无可复制的格式化结果");
      return;
    }
    try {
      await navigator.clipboard.writeText(prettyOutput);
      setCopyMessage("已复制全部结果");
    } catch {
      setCopyMessage("复制失败，请检查浏览器权限");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      {/* intro + two-pane card */}
      {/* left: textarea + format/clear */}
      {/* right: copy all + empty state or JsonTreeNode */}
    </div>
  );
};

export default JsonFormatter;
```

- [ ] **Step 3: Build the recursive JSON tree node**

Create `app/components/JsonTreeNode.tsx` and render values recursively with hover copy on the value area:

```tsx
"use client";

import { useState } from "react";

import {
  serializeJsonValueForCopy,
  type JsonValue,
} from "./json-formatter-utils";

type JsonTreeNodeProps = {
  value: JsonValue;
  nodeKey?: string;
  depth?: number;
};

const JsonTreeNode = ({ value, nodeKey, depth = 0 }: JsonTreeNodeProps) => {
  const [copyLabel, setCopyLabel] = useState("复制");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(serializeJsonValueForCopy(value));
      setCopyLabel("已复制");
      window.setTimeout(() => setCopyLabel("复制"), 1200);
    } catch {
      setCopyLabel("失败");
      window.setTimeout(() => setCopyLabel("复制"), 1200);
    }
  };

  // render primitive node or recurse into arrays/objects
  // keep copy button inside a group that becomes visible on hover
  return <div>{/* structured JSON row(s) */}</div>;
};

export default JsonTreeNode;
```

- [ ] **Step 4: Flesh out the Tailwind layout and empty/error states**

Use the same visual language as `TransactionDecoder`:

```tsx
<section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]">
  <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
    <div className="space-y-4">{/* input pane */}</div>
    <div className="space-y-4">{/* output pane */}</div>
  </div>
</section>
```

Input pane requirements:

- monospaced textarea
- helper text
- inline error message under the textarea
- `格式化` primary button
- `清空` secondary button

Output pane requirements:

- `复制全部` button
- empty state card before formatting
- scrollable tree container after formatting
- hover-only copy control on each value row

- [ ] **Step 5: Run the app build to catch type or route issues**

Run: `bun run build`

Expected: PASS with Next.js production build completing successfully

- [ ] **Step 6: Commit the UI slice**

```bash
git add app/components/AppShell.tsx app/components/JsonFormatter.tsx app/components/JsonTreeNode.tsx app/json-formatter/page.tsx
git commit -m "feat: add json formatter page"
```

### Task 3: Manual verification and polish

**Files:**
- Modify if needed: `app/components/JsonFormatter.tsx`
- Modify if needed: `app/components/JsonTreeNode.tsx`
- Verify with browser: `app/json-formatter/page.tsx`

- [ ] **Step 1: Start the dev server for manual verification**

Run: `bun dev`

Expected: local Next.js server starts and serves the new `http://localhost:3000/json-formatter` route

- [ ] **Step 2: Verify the happy path with minified JSON**

Paste this input:

```json
{"user":{"name":"alice","roles":["admin","editor"]},"enabled":true,"count":3}
```

Expected:

- the left sidebar still shows all tool links
- the `JSON 格式化` nav item appears active
- the output pane renders nested keys and values with indentation
- the top-level `复制全部` button copies the pretty-printed document

- [ ] **Step 3: Verify node-level copy behavior**

Hover and copy these values:

- string value `alice`
- boolean value `true`
- array value `["admin","editor"]`
- object value `{"name":"alice","roles":["admin","editor"]}`

Expected:

- copy button appears only on hover
- string copies as `alice`
- boolean copies as `true`
- array and object copy as two-space-indented JSON
- feedback changes briefly to `已复制`

- [ ] **Step 4: Verify invalid input and reset behavior**

Paste this invalid input:

```json
{"user":}
```

Expected:

- inline error message appears
- textarea shows error styling
- old formatted result disappears

Then click `清空`.

Expected:

- input clears
- output clears
- error clears
- copy feedback clears

- [ ] **Step 5: Run final regression commands**

Run: `bun test app/components/json-formatter-utils.test.ts`

Expected: PASS

Run: `bun run build`

Expected: PASS

- [ ] **Step 6: Commit the verified feature**

```bash
git add app/components/AppShell.tsx app/components/JsonFormatter.tsx app/components/JsonTreeNode.tsx app/components/json-formatter-utils.ts app/components/json-formatter-utils.test.ts app/json-formatter/page.tsx
git commit -m "feat: add json formatter tool"
```
