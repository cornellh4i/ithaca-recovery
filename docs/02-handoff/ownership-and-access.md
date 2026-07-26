# Ownership and Access [STUB]

Answers the handoff meeting items: *GitHub, Vercel, and MongoDB ownership*, *long-term H4I
responsibility*, *ICR access and visibility*, and *post-November continuity*.

---

## 1. Current ownership of production services

[TODO: confirm and fill in]

| Service | Owner (account holder) | Notes |
|---|---|---|
| GitHub repository | | |
| Vercel project | | |
| MongoDB Atlas cluster | | |
| Domain (if any beyond `*.vercel.app`) | | |

## 2. Confirmation: Hack4Impact continues to maintain production

Position to confirm with Matt: Hack4Impact will continue maintaining the existing production
environments rather than transferring them to ICR at this time — ICR does not currently have the
technical capacity to maintain the application independently, and an immediate transfer would add
work without improving support.

[TODO: confirm this is still the agreed position, and get it in writing/minutes from the handoff
meeting]

## 3. Long-term H4I responsibility

Open question raised 2026-07-26, **not yet decided**: who within Hack4Impact is responsible after
the current student team transitions, how continuity between teams is handled, and whether this
maintenance arrangement is expected to continue long term.

[TODO: this needs an answer from H4I leadership before or during the handoff meeting — don't
present a specific name/role here until decided, to avoid the doc going stale the moment that
person leaves. Consider documenting a *role* (e.g. "current H4I project lead for ICR") rather than
a named individual once decided.]

## 4. ICR access and visibility

What ICR gets, even though H4I remains the technical owner:

- [ ] Admin/read-only access to production logs — [TODO: decide and document how, e.g. Vercel
  observability dashboard access, log export]
- [ ] Read access to backups — [TODO: once [`backups-and-recovery.md`](backups-and-recovery.md) is
  finalized, link the mechanism here]
- [ ] Read access to production data (beyond what the app UI already exposes) — [TODO]
- [ ] A standing point of contact — see [`support-process.md`](support-process.md)

[TODO: decide the actual access level — e.g. Vercel "Viewer" role invite, a read-only MongoDB Atlas
user, or just periodic exports]

## 5. Post-November continuity

The current H4I president's term ends November 2026. The system and support process should not
depend on any one person. Concretely:

- [TODO] The support process ([`support-process.md`](support-process.md)) should route through a
  shared channel/inbox, not a personal email.
- [TODO] This doc set (`docs/02-handoff/`) is the artifact meant to make that possible — confirm
  with the incoming H4I team that they've read it before the outgoing team leaves.
- Future ICR administrators should be able to operate the application and request help without
  needing detailed technical knowledge — see [`../01-user-guide/user-guide.md`](../01-user-guide/user-guide.md)
  for the non-technical operating guide.
