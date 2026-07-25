Resolves #<!-- issue number — delete this line if there isn't one -->

@coderabbitai summary

## Description
<!--
Bullet list. Bold the primary file/path first, then what changed and briefly why.
Group related files under one bullet when they're part of the same change, e.g.:
- **path/to/file.ts**: what changed and why
-->
-

## Testing
<!-- Concrete steps a reviewer can actually run — specific commands or repro steps, not "tested thoroughly". -->
- [ ]

## Area(s) Touched
<!-- Check all that apply — automatically applies matching labels, re-synced on every edit. -->
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

## Pre-merge Checklist
<!-- Check every box below before merging to master. -->
- [ ] Code follows current formatting conventions and passes lint (`yarn lint`).
- [ ] Comments are appropriate — only where genuinely non-obvious, not restating what the code already says.
- [ ] All test suites pass, both run locally and green in GitHub CI. **Do not merge if any test suite is failing.**
- [ ] A test suite was added or updated for the feature/fix in this PR. **Double check this if you change a feature and did not update the test suites**.
- [ ] Only files relevant to this change are committed — no stray or unrelated files.
- [ ] If this branch has a merge conflict with master, master was merged into this branch first (not the other way around).
- [ ] The rest of this PR description (Description, Testing) is filled out, not left as template placeholders.