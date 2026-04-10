# JSON Formatter Redesign

## Goal

Add a dedicated `JSON 格式化` tool page to the existing EVM Toolkit that keeps the persistent left navigation visible, turns minified one-line JSON into a readable structured view, and lets users copy individual values directly from the formatted result.

## Existing Context

- The app already uses a shared shell with persistent sidebar navigation in `app/components/AppShell.tsx`.
- Each tool lives on its own route and is rendered inside the shared shell.
- The current product visual language uses:
  - a light gradient background
  - a page intro area with eyebrow, title, and supporting text
  - white rounded cards with soft borders and shadows
  - compact controls with understated hover states
- An earlier JSON formatter spec exists in the repo, but this design replaces it instead of extending it.

## User Problem

Users sometimes work with JSON that has been compressed into a single line to reduce file size. That format is difficult to read and makes it slow to inspect nested fields or copy a specific value for reuse elsewhere.

The new tool should solve two jobs well:

1. Convert minified JSON into a clean, readable structure
2. Let the user copy a specific value, including object and array subtrees, without copying the whole document

## Scope

This project covers one focused tool:

- a new sidebar entry named `JSON 格式化`
- a dedicated formatter route rendered inside the existing app shell
- a two-pane formatter workspace
- structured JSON output with per-value hover copy
- clear inline validation feedback for invalid JSON

This project does not include:

- file upload or download
- syntax highlighting libraries
- search, filtering, or node folding
- local history or persistence
- drag-and-drop input
- JSON schema validation

## Recommended Approach

### Option A: Dedicated page with structured tree output

Create a standalone route for `JSON 格式化`, add it to the sidebar, and render formatted output as a recursive JSON tree where each displayed value can expose a hover copy action.

Why this is recommended:

- matches the existing one-tool-per-page architecture
- preserves persistent left navigation for cross-tool switching
- best supports the primary use case of copying a single value
- gives the clearest visual upgrade over one-line JSON

Trade-offs:

- requires a custom recursive renderer rather than a single textarea
- has more UI state than a plain stringify output

### Option B: Dedicated page with plain formatted text output

Render the formatted result in a monospaced text block produced by `JSON.stringify(parsed, null, 2)`.

Pros:

- fastest implementation
- very low rendering complexity

Cons:

- weak support for copying a specific value
- poor foundation for hover actions on nested structures

### Option C: Plain text output with line-level enhancements

Start from formatted text but add interactive controls near displayed lines.

Pros:

- visually close to code editor output

Cons:

- brittle mapping between displayed lines and nested JSON values
- harder to maintain than a true structured tree
- weaker support for arrays and nested objects

## UX Design

### Navigation

- Add a new sidebar navigation item: `JSON 格式化`
- Place it alongside the other existing tools in `AppShell`
- The page continues to use the shared shell, so the left navigation remains visible while using the formatter

### Page Layout

The page follows the same high-level composition as the rest of the toolkit:

- eyebrow: `EVM Toolkit`
- page title: `JSON 格式化`
- one-line description explaining that minified JSON can be reformatted and inspected
- one main work card below the intro

Inside the main work card:

- left pane: raw JSON input
- right pane: formatted result

Desktop behavior:

- show the two panes side by side

Mobile behavior:

- stack panes vertically in this order: input first, output second

### Input Pane

The input pane contains:

- a pane title such as `原始 JSON`
- a multiline monospaced textarea
- helper text telling the user to paste compressed or regular JSON
- primary action: `格式化`
- secondary action: `清空`

Input behavior:

- preserve pasted text exactly until the user formats again or clears it
- allow multiline and one-line JSON equally
- keep the component visually aligned with the current design system

### Output Pane

The output pane contains:

- a pane title such as `格式化结果`
- a secondary action: `复制全部`
- an empty state when no formatted output exists yet
- the formatted JSON tree after successful parsing

The empty state should explain what will appear after formatting and should not look like an error.

## Structured JSON Rendering

### Rendering Model

The formatted result is displayed as a recursive tree, not as a single raw text block.

Each node should present:

- indentation that clearly communicates nesting
- `key` and `value` as visually distinct elements
- punctuation such as braces, brackets, commas, and colons in a subtle code-like style

### Value Presentation

Display values with lightweight type distinction:

- strings
- numbers
- booleans
- `null`
- objects
- arrays

The interface should remain consistent with the existing light visual style. The goal is readability, not a full IDE code editor.

### Copy Interaction

Copy affordances are attached to the value area, not to the key label.

Behavior:

- when the pointer hovers a value, show a compact `复制` action
- clicking that action copies only the currently hovered value
- for primitive values, copy the primitive value representation
- for objects and arrays, copy the full JSON substring for that subtree

Examples:

- `"name": "alice"` copies `alice`
- `"enabled": true` copies `true`
- `"profile": { ... }` copies the JSON for that object
- `"items": [ ... ]` copies the JSON for that array

To avoid ambiguity, the implementation should serialize copied values with `JSON.stringify(value, null, 2)` for objects and arrays, and use explicit per-type serialization rules for primitives. For this feature, the selected rule is:

- strings copy as plain text without surrounding quotes
- numbers copy as their string representation
- booleans copy as `true` or `false`
- `null` copies as `null`
- objects and arrays copy as formatted JSON with two-space indentation

### Copy Feedback

Provide lightweight, non-blocking feedback after copy:

- button label can momentarily change to `已复制`
- or show a small inline status near the relevant area

The feedback must not trigger modals, alerts, or layout jumps.

## Data Flow

All state stays local to the formatter tool component.

Required state:

- raw input text
- parsed JSON value or derived tree input
- formatted whole-document string for `复制全部`
- validation error message
- copy feedback state, scoped either globally or by copied node

Primary flow:

1. User pastes JSON into the input textarea
2. User clicks `格式化`
3. App attempts `JSON.parse(rawInput)`
4. On success:
   - clear existing error
   - store parsed data
   - store full formatted string with two-space indentation
   - render the structured JSON tree
5. On failure:
   - clear previous parsed result
   - clear previous formatted output
   - show inline parse error

## Error Handling

### Invalid JSON

If parsing fails:

- show a visible inline error message below or near the input pane
- add an error border or ring state to the textarea
- clear old formatted output so stale content is never mistaken for current output

The message should be understandable to normal users and may include the parse error text if it remains readable.

### Copy Without Result

If the user clicks `复制全部` before formatting succeeds:

- do not throw
- show a short non-blocking hint that there is no formatted result yet

### Clipboard Failure

If `navigator.clipboard.writeText` fails:

- keep the UI stable
- show a short error message near the related action
- do not erase the formatted result

## Component Boundaries

To keep the implementation isolated and maintainable, split the feature into focused units:

### Page component

Responsibilities:

- mount the tool inside `AppShell`
- provide page intro copy
- render the main formatter work card

### Formatter workspace component

Responsibilities:

- own local state
- render the input pane and output pane frame
- handle format, clear, and copy-all actions
- coordinate error and copy feedback

### Recursive JSON node component

Responsibilities:

- render one node of the parsed JSON structure
- recurse into objects and arrays
- render hover copy for the current value
- serialize the current node for copying

This split keeps parsing logic, page layout, and recursive rendering from collapsing into one oversized file.

## Technical Constraints

- Use native browser and language APIs only:
  - `JSON.parse`
  - `JSON.stringify`
  - `navigator.clipboard.writeText`
- No new runtime dependency is required
- Keep implementation compatible with the current Next.js app-router setup
- Follow the repo's existing Tailwind-based styling patterns

## Testing Strategy

Manual verification must cover:

- valid one-line JSON formats successfully
- already formatted JSON also renders correctly
- invalid JSON shows an error and clears stale output
- `复制全部` copies the full formatted document
- hovering a primitive value reveals `复制` and copies the correct value
- hovering an object value reveals `复制` and copies that subtree as formatted JSON
- hovering an array value reveals `复制` and copies that subtree as formatted JSON
- clearing the page resets input, output, errors, and copy feedback
- desktop layout shows side-by-side panes
- mobile layout stacks panes without breaking readability

## Success Criteria

The feature is successful when:

- users can reach `JSON 格式化` from the persistent left navigation
- compressed one-line JSON becomes clearly readable after formatting
- users can copy a specific value directly from the formatted result without copying the entire document
- invalid JSON produces immediate, understandable feedback
- the tool feels visually consistent with the rest of the EVM Toolkit
