---
name: Bug Report
about: Something is broken, wrong, or slower than expected
title: ''
labels: "type: bug"
---

## Describe the bug
<!--  A clear and concise description of what the bug is. -->

## To Reproduce

<!-- Steps to reproduce the behavior:

1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error -->

## Expected behavior

<!-- A clear and concise description of what you expected to happen. -->

## Screenshots

<!-- If applicable, add screenshots to help explain your problem. -->

## Additional context

<!-- Add any other context about the problem here. -->

## Priority
<!-- Select something by placing an x or X inside a bracket.
    Select one. Automatically applies "priority:" label -->
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
- [ ] docs — /docs Resources page (rendering, navigation, search)
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
