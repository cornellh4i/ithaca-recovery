# Ownership and Access [STUB]

Answers the handoff meeting items: *GitHub, Vercel, and Neon (Postgres) ownership*, *long-term H4I
responsibility*, *ICR access and visibility*, and *post-November continuity*.

---

## 1. Current ownership of production services

| Service | Owner (account holder) | Notes |
|---|---|---|
| GitHub repository | [`cornellh4i` GitHub organization](https://github.com/cornellh4i) — not a personal account | Org-owner role: current and past H4I Engineering Chairs. Repo Admin access below that is managed collectively by current admins: current + past ICR PM/TL, H4I Engineering Chairs, and the current Maintenance Lead. Day-to-day maintenance currently falls to [Nathnael Tesfaw](mailto:nbt26@cornell.edu). No credential to hand over — access changes go through GitHub org/team role assignment, not password sharing. CodeRabbit (PR review bot) is also tied into GitHub at the org/app-installation level, not to any individual account, so it doesn't need separate handoff either |
| Vercel project | [Tuni Le](mailto:ttl38@cornell.edu), under the shared account `ithacacommunityrecoverytest@gmail.com` | Open to transitioning primary control to Matt or the next Maintenance Lead — [TODO: agree on a credential-sharing mechanism, e.g. a password manager, for the shared `ithacacommunityrecoverytest@gmail.com` login] |
| Neon (Postgres) project | [Tuni Le](mailto:ttl38@cornell.edu), under the shared account `ithacacommunityrecoverytest@gmail.com` | Same shared account and open-to-transition note as Vercel above |
| Domain (if any beyond `*.vercel.app`) | N/A | No domain beyond the default `*.vercel.app` subdomain |

## 2. Confirmation: Hack4Impact continues to maintain production

Hack4Impact will continue maintaining the existing production
environments rather than transferring them to ICR at this time — ICR does not currently have the
technical capacity to maintain the application independently, and an immediate transfer would add
work without improving support.

[TODO: confirm this is still the agreed position, and get it in writing/minutes from the handoff
meeting]

## 3. Long-term H4I responsibility

Confirmed: maintenance is expected to continue through at least the upcoming semester. Beyond
that, it's contingent on whether H4I stands up a maintenance team the following semester — not a
guaranteed indefinite commitment.

Still open, raised 2026-07-26, **not yet decided**: who within Hack4Impact is responsible after
the current student team transitions, and how continuity between teams is handled (i.e. the
*mechanism* — e.g. a persistent role like "H4I Maintenance Lead for ICR" regardless of who fills
it, a required handoff meeting each transition, confirmation the incoming team has read this
Handoff section — not just a name).

[TODO: this needs an answer from H4I leadership before or during the handoff meeting.]

## 4. ICR access and visibility

What ICR gets, even though H4I remains the technical owner:

- [ ] Admin/read-only access to production logs — [TODO: decide and document how, e.g. Vercel
  observability dashboard access, log export]
- [ ] Read access to backups — [TODO: once [Backups and Recovery](backups-and-recovery.md) is
  finalized, link the mechanism here]
- [ ] Read access to production data (beyond what the app UI already exposes) — [TODO]
- [ ] A standing point of contact — see [Support Process](support-process.md)

[TODO: decide the actual access level — e.g. Vercel "Viewer" role invite, a read-only Neon
(Postgres) role, or just periodic exports]

## 5. Post-November continuity

The current H4I president's term ends November 2026. The system and support process should not
depend on any one person. Concretely:

- [TODO] The support process ([Support Process](support-process.md)) should route through a
  shared channel/inbox, not a personal email.
- [TODO] This [Handoff](../02-handoff/) section is the artifact meant to make that possible — confirm
  with the incoming H4I team that they've read it before the outgoing team leaves.
- Future ICR administrators should be able to operate the application and request help without
  needing detailed technical knowledge — see the [User Guide](../01-user-guide/) for the
  non-technical operating guide.
