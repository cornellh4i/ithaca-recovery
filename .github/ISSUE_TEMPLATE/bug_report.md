---
name: Bug Report
about: Something is broken, wrong, or slower than expected
title: ''
labels: bug
---

## Background
<!--
A paragraph on what's wrong/slow/broken and how it was found. Cite concrete evidence —
a specific log line, a timing number, a repro — not just an abstract problem statement.
-->

## Known issues to fix
<!--
State how many known issues there are below, and whether a final "measure to confirm" step
is needed, e.g. "There are 2 known issues, and likely one more requiring measurement."

For each, use a numbered ### heading and:
- State the root cause with exact path/to/file.ts:LINE references.
- Show the current problematic code in a fenced snippet.
- State the recommended fix, with a code snippet sketching the pattern (a representative
  sketch is fine — it doesn't need to be a complete ready-to-merge diff).
- Note a genuine alternative as "**Alternative:**" with its own tradeoff, if one exists.
- Mark whichever item should be done first as "(fix first)" if there's a clear dependency.
-->

### 1.

## Acceptance Criteria
<!-- Each checkbox should be concrete and independently verifiable — a specific command,
log output, or before/after comparison — not vague ("works correctly") unless paired with
what "correctly" actually means here. -->
- [ ]
