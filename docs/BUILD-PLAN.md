# CivicLense AI — build plan

## Scope decisions (make these now, don't relitigate)

**Drop MongoDB.** Supabase Postgres + PostGIS only. PostGIS is doing the real work — ward
lookup, radius clustering, contract coverage intersection. Running Mongo alongside means
writing all of that by hand in JavaScript, badly.

**Contracts are entered, not scraped.** A seeded Contract Registry with ~20 real-looking
MCGM contracts is honest, demoable, and defensible in a viva. Claiming you scrape live BMC
tender data is a question you'll lose.

**Buy the AI, build the workflow.** Claude for vision/summaries/assistant, browser Web Speech
API for voice, Google Translate or Claude for translation, Leaflet + OSM for maps. Zero model
training. Your contribution is the routing, clustering, jurisdiction and accountability layer —
say exactly that when someone asks "what did *you* build?"

### Cut from v1
Video upload · officer mobile app · SMS/push (use in-app + email) · Gujarati/Tamil/etc.
(ship en/hi/mr only) · live contractor SLA billing · real BMC data integration.

---

## Weeks

| Wk | Deliverable | Done when |
|---|---|---|
| 1 | Supabase project, `schema.sql` applied, RLS tested per role, seed script (6 wards from real GeoJSON, 20 contracts, 4 officers) | Four test logins each see only their allowed rows |
| 2 | Design system in code — tokens, `Pill`, `Stat`, `KV`, `Spine`, `CityMap`. Both app shells route | Storybook-ish page renders every primitive |
| 3 | Citizen auth + capture + upload to Supabase Storage. EXIF + GPS extraction | Photo lands in bucket with coords attached |
| 4 | **Vision pipeline.** Edge Function → Claude → `complaint_ai_analysis`. Scan screen + result card | Real photo of a pothole returns category, severity factors, authenticity |
| 5 | **`resolve_responsibility()`** wired to the Spine. Jurisdiction + contract matching | Dropping a pin in M-East names the ward, dept, agency, contract |
| 6 | **Clustering.** `find_cluster_candidate()` on insert. Cluster records, trend %, emerging detection cron | Three similar photos near one point collapse into one cluster with 3 witnesses |
| 7 | Command center: live map, layer toggles, escalation rail, stats. Leaflet with real ward polygons | Admin sees clusters on a real Mumbai basemap |
| 8 | Cluster detail + Claude cluster brief + AI command bar | Typing "which ward needs attention" returns a grounded answer |
| 9 | Officer workflow: accept, start, before/after upload, AI evidence comparison | Officer closes a job with proof; verdict stored |
| 10 | SLA triggers, escalation ladder, citizen confirmation + reopen, audit log UI | Ignoring a critical complaint for 12h escalates automatically |
| 11 | Rewards, badges, multilingual (en/hi/mr), voice input, notifications | Marathi voice complaint stores canonical English for the officer |
| 12 | Report generation, polish pass, seed a realistic 2,000-complaint dataset, demo rehearsal | Demo runs end to end twice without a reload |

---

## Demo script (7 minutes, no login screen)

1. Open on the **live city map** — 12,482 complaints, 27 hotspots. Say nothing for three seconds.
2. Switch to **Clusters** layer. The dots collapse into three numbered rings.
3. Open **SW-102**. 43 reports → 37 citizens → 380 m → 4 days. Claude's brief writes itself on screen.
4. Scroll the **Responsibility Spine**: Mumbai → Zone 6 → M-East → Ghatkopar Market → Solid Waste →
   XYZ Waste Services → **SW-2026-17, active**. Land the line: *"this isn't a complaint any more,
   it's a contract performance failure."*
5. Switch to the **phone**. Photograph an actual pothole in the room (print one out). Real Claude
   call, live, on stage. Watch the scan.
6. Submit — it joins RD-047. Cluster count ticks up on the admin screen behind you.
7. Officer uploads an after-photo. Evidence check runs. **Citizen confirms.** Hotspot goes green.

Never demo a CRUD form. Never open a table view.

---

## The viva answers you'll be asked

**"Isn't this just image classification?"** — No. Classification is one of eleven modules and the
least novel. The contribution is turning an unstructured report into a routed, deduplicated,
jurisdiction-resolved, contractually-attributed, SLA-bound work item.

**"How accurate is your AI-generated image detection?"** — Not reliable enough to be a verdict,
which is why the UI never gives one. It's a triage signal that sends images to a human queue.
Say this before they ask it.

**"What if Claude gets the category wrong?"** — Officers can reclassify; every override is logged
and the override rate is a dashboard metric. The system is designed to be corrected.

**"Why not MongoDB?"** — Because the core queries are spatial. Show them
`resolve_responsibility()`.
