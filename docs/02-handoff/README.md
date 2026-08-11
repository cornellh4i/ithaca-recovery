# Handoff Documentation

This section answers "who is responsible for what, and what happens if something goes wrong" for
the ICR Scheduling Platform. It's written for ICR board members and future maintainers, and assumes little to no coding background.

| Doc | Answers |
|---|---|
| [Ownership and Access](ownership-and-access.md) | GitHub/Vercel/Neon (Postgres) ownership, long-term H4I responsibility, ICR's access/visibility, future continuity |
| [Credentials and Integrations](credentials-and-integrations.md) | Who controls each credential (Google OAuth, Zoom, Neon, env vars) and how changes are coordinated |
| [Deployment and Rollback](deployment-and-rollback.md) | How code is reviewed, tested, approved, deployed, and rolled back; how ICR is notified of significant changes |
| [Backups and Recovery](backups-and-recovery.md) | Postgres backup frequency/retention (planned, not yet built) and the restore procedure |
| [Support Process](support-process.md) | How ICR reports a problem, what to include, who responds, and expected response time |
| [Contingency and Future Transfer](contingency-transfer.md) | How to transfer the codebase, services, data, credentials, and domain if H4I can no longer support the app |
| [Technical Decisions](technical-decisions.md) | Why the stack/architecture is built the way it is — background for the above, not itself a handoff answer |

For the day-to-day admin workflow (creating/editing meetings, Zoom assignment, suspension,
conflicts, calendar publication, signage, PandaDoc exports), see
the [User Guide](../01-user-guide/).

**Status:** this section is mid-build. Some docs are marked `[STUB]` in their title, which have an outline but not
yet full content. 
