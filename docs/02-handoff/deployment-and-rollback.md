# Deployment and Rollback [STUB]

Answers the handoff meeting item: *walk through how code changes are reviewed, tested, approved,
and deployed to production, including how failed deployments are rolled back and how ICR is
notified of significant changes.*

Most of this is directly derivable from the repo's CI config and Vercel's own behavior — lower
effort to finish than the other stubs in this folder, since it doesn't need new decisions, just
writing up what already happens.

---

## 1. Review and test (before merge)

[TODO: write up, pulling from [`../../.github/workflows/test.yml`](../../.github/workflows/test.yml)
and [`../03-development/testing/README.md`](../03-development/testing/README.md) — lint, unit,
integration, e2e all run on every PR; CodeQL security scan also runs per
[`workflows/codeql.yml`](../../.github/workflows/codeql.yml)]

## 2. Approval

[TODO: document actual GitHub branch protection rules for `master` — required reviews, required
status checks — or note if none are currently enforced]

## 3. Deploy to production

[TODO: write up — Vercel auto-deploys every push to `master`; every PR gets its own preview
deployment URL for review before merge, per [`../../README.md`](../../README.md)]

## 4. Rolling back a bad deployment

[TODO: document the actual steps — Vercel's dashboard supports instantly re-promoting a previous
deployment to production without a new git push. Confirm this is the intended rollback path and
write the click-through steps here.]

## 5. Notifying ICR of significant changes

[TODO: decide and document — what counts as "significant" (new feature? workflow change? nothing
routine), and what channel notifies ICR. Should not depend on one person remembering to send an
email — see [`ownership-and-access.md`](ownership-and-access.md) §5 on post-November continuity.]
