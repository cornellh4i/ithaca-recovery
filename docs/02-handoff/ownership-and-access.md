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

Confirmed, 2026-08-11: maintenance is owned by a semesterly H4I team, not a fixed individual or an
indefinite commitment — it's contingent on H4I standing up a maintenance team each semester. The
persistent role that carries continuity between teams is **Maintenance Lead**: whoever holds that
role at any given time is the point of contact (see §4 and [Support Process](support-process.md)).
H4I will proactively communicate toward the end of each semester if the Maintenance Lead is
changing for the next one, rather than ICR needing to ask.

## 4. ICR access and visibility

What ICR gets, even though H4I remains the technical owner:

- [ ] Admin/read-only access to production logs — [TODO: decide and document how, e.g. Vercel
  observability dashboard access, log export]
- [ ] Read access to backups — [TODO: once [Backups and Recovery](backups-and-recovery.md) is
  finalized, link the mechanism here]
- [ ] Read access to production data (beyond what the app UI already exposes) — [TODO]
- [x] A standing point of contact: the current H4I Maintenance Lead — see §3 above and
  [Support Process](support-process.md)

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
