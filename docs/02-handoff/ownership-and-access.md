# Ownership and Access

Answers the handoff meeting items: *GitHub, Vercel, and Neon (Postgres) ownership*, *long-term H4I
responsibility*, *ICR access and visibility*, and *post-November continuity*.

---

## 1. Current ownership of production services

| Service | Owner (account holder) | Notes |
|---|---|---|
| GitHub repository | [`cornellh4i` GitHub organization](https://github.com/cornellh4i) | Org-owner role: current and past H4I Engineering Chairs. Repo Admin access is managed by org-owner, current + past ICR PM/TL, and the current Maintenance Lead. |
| Vercel project | [Tuni Le](mailto:ttl38@cornell.edu), under the shared account `ithacacommunityrecoverytest@gmail.com` | Open to transitioning primary control to Matt or the next Maintenance Lead |
| Neon (Postgres) project | [Tuni Le](mailto:ttl38@cornell.edu), under the shared account `ithacacommunityrecoverytest@gmail.com` | Same shared account and open-to-transition note as Vercel above |

## 2. Hack4Impact continues to maintain production

Hack4Impact will continue maintaining the existing production
environments rather than transferring them to ICR at this time.


## 3. Long-term H4I responsibility

Maintenance is owned by a semesterly H4I team. The
persistent role that carries continuity between teams is **Maintenance Lead** (see §4 and [Support Process](support-process.md)).
H4I will proactively communicate toward the end of each semester if the Maintenance Lead is
changing for the next one, rather than ICR needing to ask.

## 4. ICR access and visibility

What ICR gets, even though H4I remains the technical owner:

- [x] Production logs — ICR has no need for direct log access, so no Vercel viewer seat is
  granted. Logs live in Vercel under H4I's account; the Maintenance Lead pulls them on request
  via [Support Process](support-process.md)
- [x] Backup evidence and encrypted downloads — the **Admin → Backups tab** 
  contains backup health, the full snapshot inventory with verification/replica evidence, and encrypted artifact
  downloads (see [Backups and Recovery](backups-and-recovery.md)). Downloads are `age`-encrypted;
  reading one requires a private key (key A: H4I Maintenance Lead; key B: Matt Kaskela, ICR
  President — see [Backups and Recovery](backups-and-recovery.md))
- [x] Read access to production data — the **Admin → Export tab** produces full meeting exports
  (XLSX) on demand, usable by any ICR Super Admin without H4I involvement.
- [x] A standing point of contact: the current H4I Maintenance Lead — see §3 above and
  [Support Process](support-process.md)

## 5. Post-November continuity

The current H4I president's term ends November 2026. The system and support process should not
depend on any one person. Concretely:

- The support process ([Support Process](support-process.md)) should continue to route through H4I's Maintenance Lead's email.
- Confirm with the incoming H4I that they have read this [Handoff](../02-handoff/) section.
- Future ICR administrators should be able to operate the   application and request help without
  needing detailed technical knowledge. See the [User Guide](../01-user-guide/) for the
  non-technical operating guide.
