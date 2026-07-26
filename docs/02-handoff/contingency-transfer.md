# Contingency and Future Transfer [STUB]

Answers the handoff meeting item: *document how the codebase, production services, data,
credentials, and domain integrations could be transferred to ICR or another maintainer if
Hack4Impact is no longer able to support the application.*

This doc assumes the transfer scenario is a real-but-hopefully-unlikely fallback, distinct from
[`ownership-and-access.md`](ownership-and-access.md) which covers the *current, ongoing*
arrangement. Think of this as "what to do if the arrangement in that doc breaks down."

---

## What would need to move

| Item | Currently | To transfer, need to |
|---|---|---|
| Codebase | GitHub repo, owner [TODO] | Transfer repo ownership or add new org/user as owner |
| Hosting | Vercel project, owner [TODO] | Transfer Vercel project, or redeploy from the GitHub repo under a new Vercel account |
| Database | MongoDB Atlas cluster, owner [TODO] | Transfer Atlas project ownership, or restore from a backup (see [`backups-and-recovery.md`](backups-and-recovery.md)) into a new cluster |
| Domain | [TODO: confirm if ICR owns a custom domain or if this stays on `*.vercel.app`] | |
| Credentials | See [`credentials-and-integrations.md`](credentials-and-integrations.md) | Each one individually re-issued or transferred per that doc's table |

## Trigger conditions

[TODO: decide what actually triggers this — e.g. "H4I has no active team for two consecutive
semesters," or "ICR requests it explicitly." Vague/undefined triggers make this plan unusable when
actually needed.]

## Who ICR would need to find

If this scenario happens, ICR likely needs either:
1. A new volunteer/contracted developer to take over as-is (in which case
   [`../03-development/`](../03-development/) is the onboarding doc set), or
2. To decommission/replace the app entirely.

[TODO: is there a standing H4I policy for this kind of handoff to a *different* student org or a
paid contractor? If so, link it. If not, note that explicitly rather than leaving it implied.]

## Minimum viable transfer package

If this ever needs to happen quickly, the minimum needed is:
- [ ] A recent database backup (see [`backups-and-recovery.md`](backups-and-recovery.md))
- [ ] This entire `docs/` folder
- [ ] Access to the GitHub repo (or a full clone)
- [ ] The credential inventory in [`credentials-and-integrations.md`](credentials-and-integrations.md),
      with actual values reset/rotated to the new owner rather than reused
