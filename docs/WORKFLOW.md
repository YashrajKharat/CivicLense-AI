# How a complaint moves

The rule the whole system is built around: **an officer cannot close a complaint.**

```
resident photographs it
        ↓
   AI classifies · severity scored with its working shown · authenticity assessed
        ↓
   resident drags the pin to the exact spot
        ↓
   ward → asset → department → agency → contract resolved
        ↓
   filed, joined to a group if others reported the same thing
        ↓
   ADMIN ASSIGNS AN OFFICER          ← /admin/complaints
        ↓
   officer accepts, starts work
        ↓
   OFFICER UPLOADS AN AFTER-PHOTO    ← the only way out of "work started"
        ↓
   before/after compared automatically → status becomes "verification"
        ↓
   RESIDENT CONFIRMS                 ← the only way to reach "resolved"
        ↓
   resolved                          or → reopened, escalated
```

## Where each step lives

| Step | Who | Screen |
|---|---|---|
| Report | Resident | `/app/report` |
| Browse nearby issues | Resident | `/app/map` |
| Assign an officer | Admin | `/admin/complaints` → Assign |
| Accept / start / send back | Officer | `/officer` |
| Upload proof | Officer | `/officer/jobs/:ref` |
| Confirm or dispute the fix | Resident | `/app/reports` |
| Watch it all | Admin | `/admin` |

## Enforced, not suggested

- `POST /officer/jobs/:ref/proof` refuses unless status is `work_started`, and sets
  `verification` — never `resolved`.
- `POST /complaints/:ref/feedback` refuses unless status is `verification`, and only the
  resident who filed it may call it.
- Saying "still there" sets `reopened` and increments `escalation_level`.
- Assignment only lists officers who are approved **and** active. An unapproved account
  cannot be given work.
- Every transition writes `complaint_status_history` and `audit_logs`, by trigger.
