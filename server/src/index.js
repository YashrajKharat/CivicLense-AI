// dotenv first: ESM hoists every import, so config.js would otherwise read an
// empty process.env and report everything missing even when .env is complete.
import "dotenv/config";
import { checkEnvironment } from "./config.js";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import me from "./routes/me.js";
import complaints from "./routes/complaints.js";
import clusters from "./routes/clusters.js";
import zones from "./routes/zones.js";
import publicRoutes from "./routes/public.js";
import geo from "./routes/geo.js";
import officer from "./routes/officer.js";
import officers from "./routes/officers.js";
import contracts from "./routes/contracts.js";
import admin from "./routes/admin.js";
import assistant from "./routes/assistant.js";
import audit from "./routes/audit.js";
import notifications from "./routes/notifications.js";
import metrics from "./routes/analytics.js";
import insights from "./routes/insights.js";
import reports from "./routes/reports.js";
import review from "./routes/review.js";
import agent from "./routes/agent.js";
import staff from "./routes/staff.js";
import categories from "./routes/categories.js";
import followups from "./routes/followups.js";
import departments from "./routes/departments.js";

import { errorHandler } from "./middleware/errors.js";
import { startScheduler } from "./jobs/scheduler.js";
import { aiProvider, cacheStats } from "./services/ai/index.js";
import { checkSchema } from "./db/schema-check.js";

checkEnvironment();

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl) and all localhost/127.0.0.1 dev origins
      if (!origin || origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:") || origin === process.env.CLIENT_ORIGIN) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

// Model calls cost money and time; they are throttled far harder than reads.
const standard = rateLimit({ windowMs: 60_000, limit: 120 });
// For routes that actually run a model. Photo analysis is the only one left —
// briefs, the assistant and reports became queries and templates, and the agent
// has its own tighter limit on starting a run.
const ai = rateLimit({ windowMs: 60_000, limit: 20 });

let schemaState = { ok: null, missing: [] };

app.get("/health", (_req, res) =>
  res.json({
    schema: schemaState,
    ok: true,
    at: new Date().toISOString(),
    ai: {
      provider: aiProvider.label,
      model: aiProvider.model,
      configured: aiProvider.configured,
      vision: aiProvider.vision,
      cache: cacheStats(),
    },
  })
);

app.use("/api/me", standard, me);
app.use("/api/staff", standard, staff);
app.use("/api/categories", standard, categories);
app.use("/api/followups", standard, followups);
// Classification runs a model on every photograph, so it keeps the tighter
// limit; the rest of the complaint routes are ordinary queries.
app.use("/api/complaints/analyse", ai);
app.use("/api/complaints", standard, complaints);
app.use("/api/clusters", standard, clusters);
app.use("/api/zones", standard, zones);

// No session required — the whole point is that it is public.
app.use("/api/public", standard, publicRoutes);
app.use("/api/geo", standard, geo);
app.use("/api/officer", standard, officer);
app.use("/api/officers", standard, officers);
app.use("/api/contracts", standard, contracts);
app.use("/api/departments", standard, departments);
app.use("/api/admin/departments", standard, departments);
app.use("/api/admin", standard, admin);
app.use("/api/audit", standard, audit);
app.use("/api/notifications", standard, notifications);
// Named "metrics", not "analytics": ad-blocker filter lists block any request
// path containing "analytics", so the old route failed with ERR_BLOCKED_BY_CLIENT
// on any machine with uBlock installed — and looked like a server fault.
app.use("/api/metrics", standard, metrics);
app.use("/api/review", standard, review);
// Intent matching over live queries, not a model call.
app.use("/api/assistant", standard, assistant);
// The tight `ai` limiter is for routes that call a model. The brief stopped
// being one when it became a set of aggregate queries — leaving it at 12 a
// minute meant opening the page a few times returned 429 on a handful of
// SELECTs.
app.use("/api/insights", standard, insights);
// Report sections are SQL; only the optional opening paragraph touches a model,
// and it already degrades to nothing when unavailable.
app.use("/api/reports", standard, reports);
// The agent makes several model calls per run, so it gets its own tighter budget.
// The tight limit belongs on starting a run — that is what costs a model call
// and what could be abused. Reading the history and the proposal queue are
// ordinary queries, and the page legitimately refreshes them after every run.
// Limiting the whole route at 6/min meant three runs exhausted it and the
// sidebar 429'd while the agent itself still worked.
app.use("/api/agent/run", rateLimit({ windowMs: 60_000, limit: 8 }));
app.use("/api/agent", standard, agent);

app.use(errorHandler);

const port = process.env.PORT || 4000;
app.listen(port, "0.0.0.0", async () => {
  console.log(`CivicLense API listening on :${port}`);

  // A missing migration otherwise surfaces later as a 500 on an unrelated
  // action, which is far harder to trace back than one line at startup.
  schemaState = await checkSchema();
  if (!aiProvider.configured) {
    console.warn(
      `[ai] ${aiProvider.label} has no API key — classification and briefs will return 503. ` +
      "See docs/AI-PROVIDERS.md."
    );
  }
  if (process.env.RUN_JOBS !== "false") startScheduler();
});

process.on("uncaughtException", (err) => {
  console.error("[server] Uncaught exception:", err.message);
});

process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled promise rejection:", reason?.message || reason);
});