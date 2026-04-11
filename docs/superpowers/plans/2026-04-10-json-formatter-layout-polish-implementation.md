# JSON Formatter Layout Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make JSON result rows read as cohesive `key: value` entries and enlarge the formatter workspace, especially the result panel, so long JSON is easier to inspect.

**Architecture:** Keep the existing formatter interactions and tree renderer, but refactor row layout in `JsonTreeNode` to use more stable structural regions so `key + :` stay visually attached while wrapping is pushed into the value area. At the page level, widen the formatter container, bias the desktop split toward the result panel, and raise both panel heights without changing state flow or copy/collapse behavior.

**Tech Stack:** Next.js app router, React 19 client components, TypeScript, Tailwind CSS, Bun test runner

---

### Task 1: Add regression coverage for row layout intent

**Files:**
- Modify: `app/components/JsonTreeNode.test.tsx`

- [ ] **Step 1: Write a failing renderer test for stable key/value grouping**

Add a focused test that renders a long string value and checks the row markup keeps the key and colon grouped separately from the value wrapper:

```tsx
test("keeps key and colon grouped while value content owns wrapping space", async () => {
  const { container } = await renderTree({
    metadata: "a".repeat(120),
  });

  const row = container.querySelector("[data-json-row='metadata']");

  expect(row).toBeTruthy();
  expect(row?.querySelector("[data-json-key='metadata']")).toBeTruthy();
  expect(row?.querySelector("[data-json-key-colon='metadata']")).toBeTruthy();
  expect(row?.querySelector("[data-json-value='metadata']")).toBeTruthy();
});
```

- [ ] **Step 2: Write a failing renderer test for non-breaking key layout**

Add a second test that ensures key-specific classes/markers do not use free-breaking behavior:

```tsx
test("does not render key labels in a free-breaking layout", async () => {
  const { container } = await renderTree({
    methodIdentifiers: {
      "executeFromSponsor((address,uint256,bytes)[])": "3f2971f0",
    },
  });

  const key = container.querySelector("[data-json-key='methodIdentifiers']");

  expect(key?.getAttribute("class") ?? "").not.toContain("break-all");
});
```

- [ ] **Step 3: Run the row-layout test file to verify it fails**

Run: `bun test app/components/JsonTreeNode.test.tsx`

Expected: FAIL because the current renderer does not expose the row/key/value markers yet and still allows the unstable key layout

- [ ] **Step 4: Keep collapse coverage intact while tests stay red**

Confirm the file still includes the existing expand/collapse coverage and that the failures are specifically about the new row-layout expectations rather than broken setup.

- [ ] **Step 5: Commit the red tests**

```bash
git add app/components/JsonTreeNode.test.tsx
git commit -m "test: cover json formatter row layout"
```

### Task 2: Refactor `JsonTreeNode` row layout for stable grouping

**Files:**
- Modify: `app/components/JsonTreeNode.tsx`

- [ ] **Step 1: Refactor `JsonLine` into stable structural regions**

Change the row layout from the current loose flex grouping to a more stable structure with explicit row regions:

```tsx
<div
  data-json-row={nodeKey ?? "__root__"}
  className="grid min-w-0 items-start gap-x-2 font-mono text-sm leading-7"
  style={{
    paddingLeft: depth * INDENT_WIDTH,
    gridTemplateColumns: `${TOGGLE_SIZE}px max-content minmax(0, 1fr) auto`,
  }}
>
```

Use dedicated elements for:

- disclosure gutter
- key-plus-colon region
- value region
- copy button region

- [ ] **Step 2: Keep key and colon visually attached**

Render the key region as a non-breaking inline group:

```tsx
<span
  data-json-key-colon={nodeKey}
  className="inline-flex min-w-0 items-start whitespace-nowrap text-slate-500"
>
  <span data-json-key={nodeKey} className="text-slate-500">
    &quot;{nodeKey}&quot;
  </span>
  <span className="px-1 text-slate-400">:</span>
</span>
```

Avoid `break-all` on the key label itself.

- [ ] **Step 3: Make the value region own wrapping**

Move wrapping responsibility into the value area:

```tsx
<span
  data-json-value={nodeKey ?? "__root__"}
  className="min-w-0 break-words"
>
  {children}
</span>
```

Long strings and long inline summaries should wrap inside this region instead of forcing the key to split away.

- [ ] **Step 4: Preserve copy and collapse behavior while updating layout**

Keep all existing behavior unchanged:

- disclosure buttons remain functional
- copy button remains attached to the node value
- collapsed summaries still render `{ ... }` / `[ ... ]`
- commas still render correctly

If needed, slightly tune the copy button alignment so it stays visually detached from the wrapped text block.

- [ ] **Step 5: Run the tree renderer test file and verify it passes**

Run: `bun test app/components/JsonTreeNode.test.tsx`

Expected: PASS with both old collapse tests and new row-layout tests green

- [ ] **Step 6: Commit the row-layout implementation**

```bash
git add app/components/JsonTreeNode.tsx app/components/JsonTreeNode.test.tsx
git commit -m "fix: stabilize json formatter row layout"
```

### Task 3: Enlarge the formatter workspace with emphasis on the result panel

**Files:**
- Modify: `app/components/JsonFormatter.tsx`

- [ ] **Step 1: Widen the outer formatter container**

Increase the workspace width so desktop uses more of the page:

```tsx
<div className="mx-auto flex w-full max-w-[1500px] flex-col gap-8 px-6 py-10">
```

Use the existing styling language; only increase available space.

- [ ] **Step 2: Rebalance the desktop column split toward the result panel**

Adjust the grid ratio so the result side gets more width than the input side:

```tsx
<div className="grid gap-6 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
```

Keep the current stacked behavior below the desktop breakpoint.

- [ ] **Step 3: Increase input and result panel heights**

Raise the panel and viewport heights:

```tsx
<textarea className="min-h-[460px] ..." />

<div className="min-h-[460px] ...">
  ...
  <div className="max-h-[680px] overflow-auto ...">
```

Keep the right panel growing more meaningfully than before.

- [ ] **Step 4: Run focused regression checks**

Run: `bun test app/components/json-formatter-utils.test.ts`

Expected: PASS

Run: `bun test app/components/JsonTreeNode.test.tsx`

Expected: PASS

Run: `bun run build`

Expected: PASS with `/json-formatter` still generated

- [ ] **Step 5: Manually verify the visual goals**

Manual checklist:

- long `key: value` rows look like one cohesive entry
- long values wrap within the value area
- right result panel is visibly wider than before on desktop
- both panels are taller than before
- collapse and copy still behave normally

- [ ] **Step 6: Commit the layout polish**

```bash
git add app/components/JsonFormatter.tsx app/components/JsonTreeNode.tsx app/components/JsonTreeNode.test.tsx
git commit -m "style: polish json formatter layout"
```
