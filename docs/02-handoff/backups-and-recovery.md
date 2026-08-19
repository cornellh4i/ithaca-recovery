# Backups and Recovery

Plain-language answer to: how is our data backed up, and what do we do if something goes wrong?

## What's backed up, and how often

The production database is backed up **four times a day**, automatically. Each backup is checked
for correctness before it's saved anywhere.

## Where copies live

Every backup is saved to **three separate places** so that no single outage, account problem, or
mistake can wipe out our data:

| Copy | Where |
|---|---|
| 1 | Google Cloud — main project |
| 2 | Google Cloud — a second, independent project |
| 3 | Cloudflare |

The Cloudflare and Google copies are protected against early deletion by the automated systems
and day-to-day credentials; only the account owners keep a deliberate emergency override for
fixing mistakes.

## How long backups are kept

| Type | Kept for |
|---|---|
| Daily backups | 21 days |
| Monthly backups (1st of each month) | about 13 months |
| Backups marked "keep forever" | forever |

## The two-key rule

Every backup is encrypted. If a copy were ever leaked or stolen, it would be unreadable without
one of two private keys — nobody else could open it.

- **Key A** is held by the H4I Maintenance Lead (currently Nathnael Tesfaw,
  nbt26@cornell.edu), stored in that role's password manager.
- **Key B** is held by ICR: Matt Kaskela, President (Matt.Kaskela@518icr.com), who also holds
  all ICR-side credentials.

Either key alone can unlock a backup — this way, one person being unreachable never locks
everyone out of our own data.

## If something fails

If a backup run fails, a GitHub issue is opened automatically so the H4I team is notified without
anyone needing to check manually. Backup health is also visible on the Backups tab in the app's
admin panel.

## What to do

> [!WARNING]
> Restoring a backup is a technical, hands-on-keyboard task — it is not something a board member
> or non-technical maintainer should attempt.

If you suspect data loss or corruption:

1. **Don't try to fix it yourself.**
2. **Contact the H4I Maintenance Lead** (nbt26@cornell.edu) or, if unavailable, **ICR's Matt
   Kaskela** (Matt.Kaskela@518icr.com) — one of them holds a decryption key and can either perform
   the restore or bring in someone who can.

## Verification: restore drills

Backups are periodically test-restored to prove they actually work, not just that they exist. An
operator runs this quarterly, restoring the newest monthly backup into a scratch database. The
Backups admin tab's Backup Health card shows when this last happened and which key holder ran it.

Mechanics: [Backup Infrastructure Setup](../03-development/backup-infra-setup.md).

## The break-glass restore runbook

Restoring a backup deliberately requires a human with a private key — no automated system can do
it on its own. This keeps our data safe even if the app or its cloud accounts were compromised.

> [!CAUTION]
> One operator at a time: restores are coordinated through the Maintenance Lead so two people
> never run one concurrently — there is no technical lock preventing it.

At a high level, an operator:

1. Picks the right backup and confirms it's undamaged.
2. Decrypts it on a machine they control (never a shared or public one).
3. Restores it into a new, separate database — never straight over the live one.
4. Double-checks the restored data before switching anything over.
5. Only then cuts over the app to the restored data, and writes up what happened afterward.

Full operator steps: [Backup Infrastructure Setup](../03-development/backup-infra-setup.md).

## Related docs

- [Backup Infrastructure Setup](../03-development/backup-infra-setup.md) — commands, accounts, and
  technical setup behind everything above.
- [Credentials and Integrations](credentials-and-integrations.md) — the full list of secrets,
  variables, and who holds what.
- [Technical Decisions](technical-decisions.md) — why the backup system is designed this way.
