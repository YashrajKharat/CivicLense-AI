# CivicLense API

Base URL `/api`. All routes except `/health` require a Supabase access token:
`Authorization: Bearer <token>`. Roles are enforced twice — in middleware and again by
row-level security in Postgres.

## Citizen

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/complaints/analyse` | multipart `photo` → classification, severity factors, authenticity. Result is staged in `pending_analyses`, not yet a complaint. |
| `GET` | `/geo/responsibility?lat=&lng=&category=` | Resolves the accountability chain for a coordinate. One PostGIS query. |
| `POST` | `/complaints` | Files the report, attaches it to a group, writes the AI analysis row. |
| `GET` | `/complaints/mine` | The citizen's own reports with status history. |
| `POST` | `/complaints/:ref/feedback` | Confirm or reject the fix. Only valid while status is `verification`. Rejecting reopens and escalates. |

## Administration

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/admin/overview` | Everything the command centre paints on load. |
| `GET` | `/clusters` | Groups plus emerging-hotspot detection. |
| `GET` | `/clusters/:ref` | One group, its merged reports and a suggested officer. |
| `POST` | `/clusters/:ref/brief` | Written summary and recommended action. Cached to the row. |
| `GET` | `/officers` | Roster with load, SLA compliance and citizen rating. |
| `GET` | `/officers/suggest?complaint=` | Ranked on distance, load, SLA record. Always overridable. |
| `GET` | `/contracts` | Registry with complaint linkage per agency. |
| `GET` | `/audit` | Read only. There is no write endpoint by design. |
| `POST` | `/assistant` | Grounded question answering over a live snapshot. |

## Rate limits

Standard routes 120 req/min. `/assistant` is limited to 12 req/min because each call is a
model invocation.

## Error shape

```json
{ "error": "Human-readable sentence.", "details": { } }
```

5xx responses never leak internals — the message is always generic and the real error is
logged server-side.

## The assistant is grounded

`/assistant` does not let the model query the database. The route builds a snapshot scoped to
the caller's role, hands it over as JSON, and instructs the model to answer only from it. A
department admin's snapshot contains only their department, so the assistant cannot surface a
row the caller could not already read.

## Officer

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/officer/queue` | Assigned work, ordered by severity then deadline. |
| `GET` | `/officer/jobs/:ref` | One job with the analysis and the citizen's own words. |
| `POST` | `/officer/jobs/:ref/status` | `accepted` / `work_started` / `rejected`. Rejection requires a reason. Illegal transitions are refused. |
| `POST` | `/officer/jobs/:ref/proof` | multipart `photo` → uploads the after image and runs the before/after comparison. Moves the complaint to `verification`, never to `resolved`. |
| `GET` | `/officer/performance` | Personal record and weekly resolution trend. |

## Additional administration

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/analytics?days=30` | City health, daily trend, category/ward/department breakdowns, resolution-time distribution, verification outcomes. |
| `GET` | `/insights` | Today's brief. Generated on demand if the 06:00 job has not run. |
| `POST` | `/insights/refresh` | Rebuild the brief now. |
| `GET` | `/review` | Images the vision module could not vouch for, with signed URLs. |
| `POST` | `/review/:ref` | A human accepts or rejects. Written to the audit log against their name. |
| `POST` | `/reports` | Generate a period report. Figures are queried; only the narrative is written. |
| `GET` | `/reports`, `/reports/:id` | Previously generated reports. |
| `POST` | `/complaints/:ref/assign` | Assign an officer. `overrodeSuggestion: true` logs it as an override. |
| `GET` | `/complaints/:ref` | Full record with proof, audit trail and responsibility chain. |

## Profile and notifications

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/me` | Profile, role, department. Citizens also get their civic record and badges. |
| `PATCH` | `/me` | Update name or preferred language. |
| `GET` | `/notifications` | Last 50, with unread count. Translated into the recipient's language on write. |
| `POST` | `/notifications/read` | Mark all read. |

## Background jobs

Run in-process on an interval scheduler (`server/src/jobs/scheduler.js`). Set `RUN_JOBS=false` to
disable — useful when running several API replicas, where only one should schedule.

| Job | Interval | Effect |
|---|---|---|
| `escalations` | 10 min | Past-deadline complaints climb the ladder: officer → department admin → global admin. Each step is audited. |
| `hotspots` | 30 min | Groups crossing 15 reports and 24 hours become hotspots. |
| `emerging` | 30 min | Linear-regression slope over five days flags groups whose rate is accelerating. |
| `purge` | 60 min | Clears staged analyses older than a day. |
| `brief` | daily 06:00 | Writes the daily brief for every department and one global. |
