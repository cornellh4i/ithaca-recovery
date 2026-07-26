# Handoff Documentation

This folder answers "who is responsible for what, and what happens if something goes wrong" for
the ICR Scheduling Platform. It's written for ICR board members and future maintainers, not just
developers — no coding background assumed.

It exists specifically to answer the questions raised for the handoff meeting with Matt
(Hack4Impact ↔ ICR board). Each doc below notes which of those questions it covers.

| Doc | Answers |
|---|---|
| [`ownership-and-access.md`](ownership-and-access.md) | GitHub/Vercel/MongoDB ownership, long-term H4I responsibility, ICR's access/visibility, post-November continuity |
| [`credentials-and-integrations.md`](credentials-and-integrations.md) | Who controls each credential (Google OAuth, Zoom, Mongo, env vars) and how changes are coordinated |
| [`deployment-and-rollback.md`](deployment-and-rollback.md) | How code is reviewed, tested, approved, deployed, and rolled back; how ICR is notified of significant changes |
| [`backups-and-recovery.md`](backups-and-recovery.md) | MongoDB backup frequency/retention and the restore procedure |
| [`support-process.md`](support-process.md) | How ICR reports a problem, what to include, who responds, and expected response time |
| [`contingency-transfer.md`](contingency-transfer.md) | How to transfer the codebase, services, data, credentials, and domain if H4I can no longer support the app |
| [`technical-decisions.md`](technical-decisions.md) | Why the stack/architecture is built the way it is — background for the above, not itself a handoff answer |

For the day-to-day admin workflow (creating/editing meetings, Zoom assignment, suspension,
conflicts, imports, calendar publication, signage, PandaDocs exports), see
[`../01-user-guide/user-guide.md`](../01-user-guide/user-guide.md) — that doc already covers the
"Application workflow" item from the handoff list.

**Status:** this folder is mid-build. Docs marked `[STUB]` in their title have an outline but not
yet full content — several of them need decisions from H4I leadership or ICR (not just facts about
the code) before they can be finalized. Don't treat a `[STUB]` doc as a final answer to give Matt.
