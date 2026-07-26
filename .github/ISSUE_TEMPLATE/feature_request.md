---
name: Feature Request
about: Planned or proposed new functionality
title: ''
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

## Type
<!-- Select something by placing an x or X inside a bracket.
    Select one. Automatically applies "type: enhancement" or "type: feature" label. -->
- [ ] Enhancement — improves or extends an existing feature.
- [ ] New feature — adds functionality that doesn't exist yet.

## Priority
<!-- Select one. Automatically applies "priority:" label.-->
- [ ] Critical — urgent fix: a core feature is broken, fix right now.
- [ ] High — blocks other work/testing, or has a near-term deadline.
- [ ] Medium — standard work, a minor bug with an easy workaround, or next up after high-priority items.
- [ ] Low — nice-to-have, distant goal, or minor typo.

## Area(s) Touched
<!-- Automatically applies matching "scope:"/"type:" labels, re-synced on every edit.
    Select one or many. A best guess is fine; this gets corrected during triage if wrong. -->
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