# Deployment and Rollback

Answers the handoff meeting item: *walk through how code changes are reviewed, tested, approved,
and deployed to production, including how failed deployments are rolled back and how ICR is
notified of significant changes.*

§§1-3 describe how things work today, pulled from the project's actual configuration — no
decisions needed there. §4 flags a real open item (no notification process decided yet).

---

## 1. Review and test (before merge)

Every code change goes through a pull request — a proposed change that sits open for review before
it becomes part of the live app. Before one can be merged, two things are required:

- **A second person has to approve it.** Whoever wrote the change can't approve their own pull
  request — that's not allowed.
- **A set of automated checks has to pass** — code style, a type-check pass, and four tiers of
  automated tests (unit, component-level, integration, and full click-through tests of the actual
  app). See [Testing](../03-development/testing/README.md) for what each covers.

GitHub itself blocks the merge until both are satisfied.

**Two caveats:**

- A couple of secondary checks (a documentation-freshness check and a security scan) run
  automatically but aren't required to pass before merging. Thus, it's possible, though not
  typical, for one of those specifically to be failing at merge time. The core tests mentioned
  above are always required.
- A small number of people with Admin-level access on the repository can skip the
  review/check requirement entirely if needed. This is a standard GitHub capability reserved for
  exceptional cases, and is not part of the normal day-to-day process.

## 2. Deploy to production

Merging into the live branch deploys automatically — there's no separate manual "deploy" step.
Every open pull request also gets its own preview link, so a reviewer can click through the actual
working app before approving it, not just read the code.

One caveat: the automatic deploy doesn't check on its own whether a review happened or the tests
passed — it just publishes whatever's on the live branch. In the normal process that's a
non-issue, since nothing reaches the live branch without going through review and passing tests
first (§1). It would only matter if someone used the Admin bypass mentioned above.

## 3. Rolling back a bad deployment

Vercel's dashboard supports instantly re-promoting any previous successful deployment to
production, with no new git push or rebuild required: **Vercel dashboard → project → Deployments
→ find the last known-good deployment → "..." menu → Promote to Production**. This is the
intended rollback path — it takes effect immediately rather than waiting for a new fix to be
written, reviewed, and rebuilt.

This only rolls back the *application code* — it does not undo a database migration or any data
written under the bad deploy. A rollback that needs the database restored to a prior state depends
on [Backups and Recovery](backups-and-recovery.md).

## 4. Notifying ICR of significant changes

Release notes are written manually and sent to ICR **by email** (the Maintenance Lead owns this —
see [Support Process](support-process.md) for the contact chain).

A change is **significant** if it is a new feature, or in any way impacts the end-user experience
significantly — routine fixes, refactors, dependency bumps, and docs changes don't warrant a
notice. When in doubt, a one-line email costs nothing.
