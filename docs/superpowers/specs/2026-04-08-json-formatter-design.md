# JSON Formatter Design

## Goal

Add a dedicated `JSON 格式化` tool page to the existing EVM Toolkit so users can paste minified JSON, format it for readability, copy the formatted result, and see clear error feedback when the input is invalid.

## Existing Context

- The app already uses one-tool-per-page navigation in `app/components/AppShell.tsx`.
- Existing tool pages use a shared visual language:
  - top page intro with `EVM Toolkit` eyebrow, title, and short description
  - white rounded cards with subtle borders and shadows
  - compact action buttons and form fields
- The requested reference layout is a three-column workbench. It should influence structure, not replace the current product styling.

## UX Design

### Page Placement

- Add a new sidebar navigation item: `JSON 格式化`
- Create a dedicated route for the formatter page instead of embedding it into an existing tool

### Page Structure

The formatter page uses one main card with a responsive three-column layout:

1. Left column: raw JSON input editor
2. Middle column: action rail
3. Right column: formatted JSON output viewer

Desktop:
- three columns visible side by side

Mobile / narrow screens:
- stack vertically in this order: input, actions, output

### Visual Language

- Keep the current app's light theme, border radius, spacing, and button styles
- Use monospace text areas for JSON content to preserve an editor-like feel
- Use subtle labels/badges in card headers rather than a dark IDE toolbar
- Keep the middle action rail visually compact and aligned with the current component system

## Functional Requirements

### Input

- Provide a multiline input area for pasting JSON
- Preserve the user's input exactly until they explicitly clear or replace it

### Format Action

- Clicking `格式化` parses the input with `JSON.parse`
- On success, render formatted output using `JSON.stringify(parsed, null, indent)`
- Default indentation is 2 spaces

### Copy Action

- Clicking `复制结果` copies only the formatted output
- If no formatted output exists, show a short non-blocking message

### Clear Action

- Clicking `清空` resets:
  - input text
  - formatted output
  - error state
  - copy status message

### Error Handling

- Invalid JSON shows a visible inline error message
- The input editor switches to an error border/ring state
- Formatting output is cleared on parse failure so stale content is not mistaken for current output

## Data Flow

- Local component state only; no storage required
- State to track:
  - raw input
  - formatted output
  - parse error message
  - copy feedback message
  - optional indent selection if included in implementation

## Technical Approach

- Create a dedicated client component for the formatter UI
- Add a route page file that renders the new component
- Update sidebar navigation to include the new page
- Use native browser APIs only:
  - `JSON.parse`
  - `JSON.stringify`
  - `navigator.clipboard.writeText`

No extra dependencies are needed.

## Testing Strategy

Manual verification should cover:

- paste valid minified JSON and format successfully
- copy formatted result successfully
- paste invalid JSON and confirm error message + error highlight
- clear all state successfully
- confirm mobile stacking and desktop three-column layout

## Scope Guardrails

This change does not include:

- syntax highlighting libraries
- file upload / download
- schema validation
- JSON to other formats
- persistent history or local storage
