# Contingency and Future Transfer [STUB]

Answers the handoff meeting item: *document how the codebase, production services, data,
credentials, and domain integrations could be transferred to ICR or another maintainer if
Hack4Impact is no longer able to support the application.*

This doc assumes the transfer scenario is a real-but-hopefully-unlikely fallback, distinct from
[Ownership and Access](ownership-and-access.md) which covers the *current, ongoing*
arrangement. Think of this as "what to do if the arrangement in that doc breaks down."

---

## What would need to move

| Item | Currently | To transfer, need to |
|---|---|---|
| Codebase | GitHub repo under the `cornellh4i` org — see [Ownership and Access](ownership-and-access.md) §1 for who holds org-owner/Admin roles | Add the new maintainer's account with Admin (or transfer/fork the repo to a new org entirely if leaving `cornellh4i` altogether) |
| Hosting | Vercel project, shared account `ithacacommunityrecoverytest@gmail.com` — see [Ownership and Access](ownership-and-access.md) §1 | Transfer the Vercel project, or redeploy from the GitHub repo under a new Vercel account |
| Database | Neon (Postgres) project, same shared account — see [Ownership and Access](ownership-and-access.md) §1 | Transfer Neon project ownership, or restore from a backup (see [Backups and Recovery](backups-and-recovery.md)) into a new project |
| Domain | None beyond the default `*.vercel.app` subdomain — nothing to transfer here | |
| Credentials | See [Credentials and Integrations](credentials-and-integrations.md) | Each one individually re-issued or transferred per that doc's table |

## Trigger conditions

[TODO: decide what actually triggers this — e.g. "H4I has no active team for two consecutive
semesters," or "ICR requests it explicitly." Vague/undefined triggers make this plan unusable when
actually needed.]

## Who ICR would need to find

If this scenario happens, ICR likely needs either:
1. A new volunteer/contracted developer to take over as-is (in which case
   the [Development](../03-development/) docs are the onboarding doc set), or
2. To decommission/replace the app entirely.

[TODO: is there a standing H4I policy for this kind of handoff to a *different* student org or a
paid contractor?]

## Minimum viable transfer package

If this ever needs to happen quickly, the minimum needed is:
- [ ] A recent database backup (see [Backups and Recovery](backups-and-recovery.md))
- [ ] This entire `docs/` folder
- [ ] Access to the GitHub repo (or a full clone)
- [ ] The credential inventory in [Credentials and Integrations](credentials-and-integrations.md),
      with actual values reset/rotated to the new owner rather than reused
