---
name: Feature Request
about: Planned or proposed new functionality
title: ''
labels: enhancement
---

## Background
<!-- What's motivating this — a user need, a gap in existing functionality, a follow-up
noted during other work. Cite where this came from (a conversation, a deferred item from
another ticket/PR) rather than just stating the desired end state. -->

## Proposal
<!--
Numbered ### 1., ### 2. sections if there are multiple discrete pieces of work; a single
description is fine if it's one cohesive change. Each piece should:
- Say what should change, with exact path/to/file.ts references where known.
- Sketch the approach — a code/UI snippet if it helps, doesn't need to be ready-to-merge.
- Note a genuine alternative as "**Alternative:**" with its own tradeoff, if one exists.
- Mark whichever item should be done first as "(do first)" if there's a clear dependency.
-->

## Acceptance Criteria
<!-- Each checkbox should be concrete and independently verifiable — a specific command,
log output, or before/after comparison — not vague ("works correctly") unless paired with
what "correctly" actually means here. -->
- [ ]

## Area(s) Touched
<!-- Check all that apply — automatically applies matching labels, re-synced on every edit.
A best guess is fine; this gets corrected during triage if wrong. -->
**Product areas**
- [ ] auth — sign-in, sessions, NextAuth, role-based access
- [ ] admin — /admin shell (Diagnostics, Users, Import, Export tabs)
- [ ] billing — lease export, XLSX import, anything affecting invoicing
- [ ] ui/ux — frontend layout/styling not tied to a specific integration

**Integrations**
- [ ] google-calendar — Google Calendar sync
- [ ] zoom-api — Zoom meeting/host sync

**Engineering**
- [ ] security — auth hardening, data exposure, dependency/security scanning
- [ ] testing — test suite (Jest/Playwright) changes
- [ ] github-actions — workflows, Dependabot config, other .github/ CI tooling
- [ ] cleanup — refactor or dead-code removal, no behavior change
- [ ] documentation — docs/ or README changes only
