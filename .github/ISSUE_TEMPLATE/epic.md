---
name: Epic / Multi-part Feature
about: A big feature or initiative that needs to be broken into multiple sub-issues
title: ''
---

## Background
<!-- What's motivating this — the overall goal, and why it's too big for a single issue. -->

## Sub-issues
<!-- File each piece of work as its own Feature Request issue, then link it here.
Checking a box here is just for tracking -- it does not close the linked issue. -->
- [ ] #

## Definition of Done
<!-- When is this epic actually finished? Same bar as Acceptance Criteria on a regular Feature
Request: concrete and independently verifiable, not vague. -->
- [ ]

## Type
<!-- Select something by placing an x or X inside a bracket.
    Select one. Automatically applies "type: enhancement" or "type: feature" label. -->
- [ ] Enhancement — improves or extends an existing feature.
- [ ] New feature — adds functionality that doesn't exist yet.

## Priority
<!-- Select one. Automatically applies "priority:" label -->
- [ ] Critical — urgent fix: a core feature is broken, fix right now.
- [ ] High — blocks other work/testing, or has a near-term deadline.
- [ ] Medium — standard work, a minor bug with an easy workaround, or next up after high-priority items.
- [ ] Low — nice-to-have, distant goal, or minor typo.

## Area(s) Touched
<!-- Automatically applies matching "scope:"/"type:" labels.
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
