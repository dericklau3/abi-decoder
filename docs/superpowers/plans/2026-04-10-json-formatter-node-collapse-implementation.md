# JSON Formatter Node Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-node expand/collapse triangles to the JSON formatter result tree so object and array branches can be collapsed into `{ ... }` or `[ ... ]` summaries without changing copy behavior.

**Architecture:** Keep the collapse behavior local to `JsonTreeNode` so each expandable object/array node owns its own `isExpanded` state. Extend the existing inline JSON renderer rather than moving state up to `JsonFormatter`, and cover the behavior with focused renderer tests before wiring in the disclosure UI.

**Tech Stack:** Next.js app router, React 19 client components, TypeScript, Tailwind CSS, Bun test runner

---

### Task 1: Add renderer tests for expand/collapse behavior

**Files:**
- Modify: `app/components/JsonTreeNode.test.tsx`

- [ ] **Step 1: Write the failing collapse tests**

Add tests to `app/components/JsonTreeNode.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";

test("renders expandable object and array toggles expanded by default", () => {
  render(
    <JsonTreeNode
      value={{
        abi: [
          {
            type: "constructor",
            inputs: [],
          },
        ],
      }}
      onCopy={() => {}}
    />,
  );

  expect(screen.getAllByRole("button", { name: /切换展开状态/i }).length).toBeGreaterThan(0);
  expect(screen.getByText('"type"')).toBeInTheDocument();
  expect(screen.getByText('"constructor"')).toBeInTheDocument();
});

test("collapses an object node to a single-line summary", () => {
  render(
    <JsonTreeNode
      value={{
        abi: [
          {
            type: "constructor",
            inputs: [],
          },
        ],
      }}
      onCopy={() => {}}
    />,
  );

  fireEvent.click(screen.getAllByRole("button", { name: /切换展开状态/i })[1]);

  expect(screen.getByText("{ ... }")).toBeInTheDocument();
  expect(screen.queryByText('"type"')).toBeNull();
});
```

- [ ] **Step 2: Run the renderer test file to verify it fails**

Run: `bun test app/components/JsonTreeNode.test.tsx`

Expected: FAIL because collapse controls and collapsed summaries do not exist yet

- [ ] **Step 3: Expand the tests for arrays and copy stability**

Append one more focused test:

```tsx
test("keeps node copy available after collapsing an array branch", () => {
  const handleCopy = jestLikeFn();

  render(
    <JsonTreeNode
      value={{ abi: [{ type: "constructor" }] }}
      onCopy={handleCopy}
    />,
  );

  fireEvent.click(screen.getByLabelText("切换展开状态"));
  fireEvent.click(screen.getByLabelText("复制 abi"));

  expect(screen.getByText("[ ... ]")).toBeInTheDocument();
  expect(handleCopy).toHaveBeenCalled();
});
```

Use a simple local spy helper compatible with the chosen test setup instead of introducing a new mocking library.

- [ ] **Step 4: Re-run the test file and confirm the new assertions still fail for the missing behavior**

Run: `bun test app/components/JsonTreeNode.test.tsx`

Expected: FAIL with assertions about missing toggle buttons and collapsed summaries

- [ ] **Step 5: Commit the test-only slice**

```bash
git add app/components/JsonTreeNode.test.tsx
git commit -m "test: cover json tree collapse behavior"
```

### Task 2: Implement per-node expand/collapse in `JsonTreeNode`

**Files:**
- Modify: `app/components/JsonTreeNode.tsx`
- Read: `app/components/JsonFormatter.tsx`

- [ ] **Step 1: Add local expanded state for expandable nodes**

Update `JsonTreeNode.tsx` to import `useState` and derive expandability:

```tsx
import { useState, type ReactNode } from "react";

// ...

const isArray = Array.isArray(value);
const isObject = typeof value === "object" && value !== null && !isArray;
const isExpandable = isArray || isObject;
const [isExpanded, setIsExpanded] = useState(true);
```

Make sure the state is only used to control object/array rendering and not introduced into `JsonFormatter`.

- [ ] **Step 2: Add a triangle toggle control with a comfortable hit area**

Introduce a disclosure button rendered before expandable node values:

```tsx
const ToggleIcon = ({ isExpanded }: { isExpanded: boolean }) => (
  <span
    aria-hidden="true"
    className={`inline-block text-[11px] text-slate-500 transition ${
      isExpanded ? "rotate-90" : "rotate-0"
    }`}
  >
    ▶
  </span>
);
```

Render it with:

```tsx
<button
  type="button"
  className="mr-1 inline-flex h-6 w-6 flex-none items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
  onClick={() => setIsExpanded((current) => !current)}
  aria-label="切换展开状态"
>
  <ToggleIcon isExpanded={isExpanded} />
</button>
```

- [ ] **Step 3: Render collapsed summaries for objects and arrays**

When `isExpandable && !isExpanded`, replace child rendering with inline summaries:

```tsx
if (isArray && !isExpanded) {
  return (
    <JsonLine ...>
      <span className="text-slate-500">[ ... ]</span>
    </JsonLine>
  );
}

if (isObject && !isExpanded) {
  return (
    <JsonLine ...>
      <span className="text-slate-500">{`{ ... }`}</span>
    </JsonLine>
  );
}
```

Keep commas correct with `isLast`, and keep the node value passed to the copy action unchanged so collapsed nodes still copy their full subtree.

- [ ] **Step 4: Preserve current expanded rendering while integrating the toggle**

Refactor the current object/array branches so:

- expanded object still renders `{`, children, and `}`
- expanded array still renders `[`, children, and `]`
- primitive rendering remains unchanged
- toggle button appears only for object/array nodes
- copy button remains attached to the value area

- [ ] **Step 5: Run the renderer tests to verify the new behavior passes**

Run: `bun test app/components/JsonTreeNode.test.tsx`

Expected: PASS with collapse tests green

- [ ] **Step 6: Commit the renderer implementation**

```bash
git add app/components/JsonTreeNode.tsx app/components/JsonTreeNode.test.tsx
git commit -m "feat: add json tree node collapse"
```

### Task 3: Verify formatter integration and guard against regressions

**Files:**
- Verify only unless fixes are needed: `app/components/JsonFormatter.tsx`
- Verify only unless fixes are needed: `app/components/JsonTreeNode.tsx`

- [ ] **Step 1: Re-run existing formatter helper tests**

Run: `bun test app/components/json-formatter-utils.test.ts`

Expected: PASS

- [ ] **Step 2: Run the updated tree renderer tests**

Run: `bun test app/components/JsonTreeNode.test.tsx`

Expected: PASS

- [ ] **Step 3: Run the production build**

Run: `bun run build`

Expected: PASS with the `/json-formatter` route still generated

- [ ] **Step 4: Manually verify collapse behavior in the browser**

Manual checklist:

- format a nested object and confirm triangles appear on object/array nodes
- confirm all nodes start expanded
- click a node triangle and confirm it collapses to `{ ... }` or `[ ... ]`
- click again and confirm children return
- confirm collapsing one branch does not affect sibling branches
- confirm collapsed node copy still copies the full node value

- [ ] **Step 5: Commit any final verification fixes**

```bash
git add app/components/JsonTreeNode.tsx app/components/JsonTreeNode.test.tsx app/components/JsonFormatter.tsx
git commit -m "test: verify json tree collapse integration"
```
