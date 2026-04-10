# JSON Formatter Layout Polish Design

## Goal

Improve the `JSON 格式化` workspace so structured result rows read as cohesive `key: value` units and the two main panels use more of the available page space, with extra emphasis on enlarging the result panel.

## Existing Context

- The formatter already lives on its own route inside `AppShell`.
- The result tree supports per-node copy and expand/collapse behavior.
- The current result row layout is built in `app/components/JsonTreeNode.tsx`.
- The formatter workspace layout is controlled in `app/components/JsonFormatter.tsx`.

## User Problem

Some result rows currently let the key and value break apart visually, especially when long values are present. This makes the tree feel fragmented rather than code-like.

At the same time, both the input and result panels are still smaller than they need to be for a tool that is primarily about reading and scanning large JSON, especially on desktop where the page has more horizontal room.

## Scope

This enhancement covers:

- making result rows behave more like stable code-view lines
- keeping `key + :` visually together as much as possible
- allowing long values to wrap inside the value area instead of splitting the row structure
- widening the formatter workspace
- increasing both panel heights
- giving the result panel a larger share of the desktop width

This enhancement does not include:

- changes to copy behavior
- changes to expand/collapse behavior
- syntax-highlighting libraries
- line numbers
- search/filter
- new layout modes for mobile beyond preserving current responsive behavior

## Recommended Approach

### Option A: Stable multi-column row layout plus larger desktop work area

Refactor each JSON row into a more stable layout with dedicated structural regions:

- disclosure gutter
- key and colon
- value area
- copy control

At the page level, widen the overall workspace and rebalance the two-panel grid in favor of the result panel.

Why this is recommended:

- directly addresses the root cause of fragmented row wrapping
- preserves the current tree renderer instead of replacing it
- uses existing page structure and styling patterns
- improves readability without changing interaction semantics

Trade-offs:

- requires more careful row CSS than the current simple flex layout
- needs a small amount of layout tuning for long keys and long values

### Option B: Keep current row structure and only tweak wrapping classes

Pros:

- smaller code diff
- quickest to try

Cons:

- likely brittle because the current structure is the source of the split behavior
- may still allow key/value fragmentation under pressure

### Option C: Convert result view into a pure preformatted code block

Pros:

- code-like reading behavior is easier to preserve

Cons:

- would weaken the current per-node interaction model
- fights against expand/collapse and per-node copy
- too large a design change for this scope

## UX Design

### Result Row Structure

Each rendered row should behave as one structured line, not as a loose collection of independently wrapping blocks.

Preferred visual grouping:

- disclosure triangle on the far left
- `key:` grouped tightly together
- value content immediately following
- copy button aligned at the row edge

The key and colon should remain visually attached. The row should prefer wrapping within the value area rather than splitting the key onto one visual block and the value onto another disconnected block.

### Value Wrapping

When values are long:

- wrapping should happen within the value region
- long strings may wrap across multiple visual lines inside that same region
- the key should stay visually anchored to the beginning of the row

This should make long values feel like long code lines wrapping in-place rather than separate floating fragments.

### Panel Sizing

Desktop sizing should shift more space toward the result panel.

Changes:

- increase the formatter page max width
- increase both panel minimum heights
- increase the result container scroll area height
- bias the two-column ratio toward the result panel

The input panel should also grow, but the result panel should grow more because it is the main reading surface.

### Responsive Behavior

Desktop:

- maintain two columns
- give the result panel more width than the input panel

Mobile / narrow screens:

- keep stacked layout
- do not force a cramped desktop-style ratio onto small screens

## Technical Approach

### `JsonTreeNode`

Refactor the row container so it behaves more like a structured grid than a free-flow flex row.

Target behavior:

- disclosure gutter has a fixed width
- key area has stable intrinsic width and avoids arbitrary breaking
- value area takes remaining space and is the primary wrapping region
- copy button remains aligned and does not push key/value into unstable wrapping

Possible implementation direction:

- use CSS grid for the top-level row
- or use a carefully constrained flex layout with a non-wrapping key region and a wrapping value region

The key requirement is not the CSS mechanism itself, but the resulting stability.

### `JsonFormatter`

Adjust the workspace container sizing:

- increase outer max width
- rebalance column widths in favor of the result pane
- increase left textarea minimum height
- increase right result viewer minimum and scroll height

No new state or interaction logic is required here.

## Testing Strategy

Verification should cover:

- long keys with short values still read as one coherent row
- short keys with long values wrap within the value area rather than splitting the row awkwardly
- collapsed and expanded nodes still look aligned after row layout changes
- desktop layout shows visibly larger panels than before
- result panel receives more width than the input panel on desktop
- mobile stacked behavior still works

If automated renderer tests are practical, add at least one focused regression test around markup/class structure that protects the intended row layout. Manual verification should still confirm the real visual outcome.

## Success Criteria

This enhancement is successful when:

- structured result rows visually read as unified `key: value` entries
- long values wrap inside the value area rather than making the row feel fragmented
- the formatter page uses more horizontal and vertical space
- the result panel is noticeably roomier than before
- existing copy and collapse behaviors continue to work unchanged
