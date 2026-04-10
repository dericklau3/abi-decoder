# JSON Formatter Node Collapse Design

## Goal

Improve the `JSON 格式化` result viewer by adding expand/collapse controls for object and array nodes so large JSON documents are easier to scan without losing the existing per-node copy behavior.

## Existing Context

- The formatter tool already exists as a dedicated route rendered inside `AppShell`.
- Structured output is currently rendered by `app/components/JsonTreeNode.tsx`.
- The result area now shows JSON in an inline tree format instead of nested cards.
- Users can already copy a node value from the value area, and copy-all still copies the full formatted document.

## User Problem

Large nested JSON is still visually heavy even after formatting. Users need a quick way to temporarily hide sections they are not inspecting so they can focus on the relevant branch of the tree.

The new enhancement should make browsing easier without changing the page layout or weakening copy behavior.

## Scope

This enhancement covers:

- expand/collapse triangles for object nodes
- expand/collapse triangles for array nodes
- default expanded state for all expandable nodes
- collapsed summaries rendered as `{ ... }` or `[ ... ]`
- preserving node copy while a node is collapsed

This enhancement does not include:

- global “expand all” / “collapse all” controls
- persisted collapse state
- search/filter inside JSON
- virtualized rendering
- keyboard shortcut support beyond normal button accessibility

## Recommended Approach

### Option A: Local state per expandable node

Each object/array node manages its own expanded/collapsed state inside `JsonTreeNode`.

Why this is recommended:

- keeps state close to the UI it controls
- avoids building and threading a path-key state map through the whole tree
- matches the current recursive renderer naturally
- enough for the current scope

Trade-offs:

- all nodes reset to expanded when the formatted tree re-renders from fresh input
- less suitable if future requirements add “expand all” behavior

### Option B: Centralized collapse map keyed by node path

Track expansion state in the parent formatter component and pass it down by node path.

Pros:

- good foundation for global expand/collapse controls
- collapse state can survive some rerenders more predictably

Cons:

- more wiring and more moving pieces than this scope needs
- increases coupling between the workspace and the recursive renderer

### Option C: Native `<details>` / `<summary>` wrappers

Use browser native disclosure widgets for expandable nodes.

Pros:

- fast to prototype
- built-in semantics

Cons:

- harder to keep aligned with the current JSON line layout
- harder to control summary text and copy placement cleanly
- visual styling is less consistent with the current interface

## UX Design

### Expandable Nodes

Only object and array nodes get a triangle control.

Behavior:

- default state is expanded
- expanded node shows a downward-facing triangle
- collapsed node shows a right-facing triangle
- clicking the triangle toggles only the current node

Primitive values remain non-expandable and do not show a triangle.

### Collapsed Presentation

When a node is collapsed:

- object nodes render their value as `{ ... }`
- array nodes render their value as `[ ... ]`
- the key label, colon, comma behavior, and copy affordance remain in place

The summary should stay on the same line as the current node so the tree remains easy to scan.

### Click Targets

The triangle should have a comfortable button hit area rather than a tiny icon-only target.

This is especially important because users may click many nodes in succession while scanning.

### Copy Behavior

Collapsing a node must not change what gets copied.

Rules:

- collapsing an object still copies the full object JSON for that node
- collapsing an array still copies the full array JSON for that node
- primitive copy behavior remains unchanged

The copy action still belongs to the value area, not the key.

## Data Flow

Expansion state stays local to each expandable `JsonTreeNode` instance.

Required behavior:

- first render of a formatted tree starts expanded
- toggling one node does not affect sibling nodes
- reformatting a new JSON input resets the tree to fully expanded because it mounts a fresh tree

No additional parent-level state is required in `JsonFormatter`.

## Component Boundaries

### `JsonTreeNode`

Responsibilities added by this enhancement:

- determine whether the current node is expandable
- own `isExpanded` state for expandable nodes
- render triangle button with correct direction
- swap child block rendering with collapsed summary when needed

### `JsonFormatter`

No new state responsibilities should be added here for collapse behavior.

It should continue to treat the result tree as a render-only child and keep responsibility for input, parse state, copy-all, and feedback.

## Rendering Rules

Expanded object:

- current line shows triangle + `{`
- child entries render below
- closing `}` renders at the matching indentation level

Expanded array:

- current line shows triangle + `[`
- child items render below
- closing `]` renders at the matching indentation level

Collapsed object:

- current line shows triangle + `{ ... }`

Collapsed array:

- current line shows triangle + `[ ... ]`

Comma rendering must remain correct whether a node is expanded or collapsed.

## Testing Strategy

At minimum, verification should cover:

- object nodes render expanded by default
- array nodes render expanded by default
- clicking a node triangle collapses it to `{ ... }` or `[ ... ]`
- clicking again restores child content
- collapsing one node does not collapse siblings
- collapsed nodes still copy the full node value, not the summary text

If automated UI tests are still not practical in this repo, add at least one focused component-level regression test for the renderer shape and keep manual verification for interaction.

## Success Criteria

The enhancement is successful when:

- users can collapse and re-expand object/array branches directly in the result tree
- large JSON becomes easier to scan
- collapsed nodes still preserve existing copy behavior
- the visual style stays consistent with the current formatter page
