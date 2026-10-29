import { runEscalations, promoteHotspots } from "../services/sla.js";
import { detectEmerging } from "../services/clustering.js";
import { buildDailyBrief } from "../services/insights.js";
import { query } from "../db/pool.js";

/**
 * Deliberately a plain interval scheduler rather than a queue. At this scale the
 * work is small and idempotent, and a second process would be one more thing to
 * keep running. Swap for pg-boss or BullMQ when volume justifies it.
 */
const JOBS = [
  { name: "escalations",  everyMs: 10 * 60_000, run: runEscalations },
  { name: "hotspots",     everyMs: 30 * 60_000, run: promoteHotspots },
  { name: "emerging",     everyMs: 30 * 60_000, run: detectEmerging },
  { name: "purge",        everyMs: 60 * 60_000, run: () => query("select purge_pending_analyses()") },
  { name: "proposals",    everyMs: 30 * 60_000, run: () => query("select expire_agent_proposals()") },
];

export function startScheduler() {
  for (const job of JOBS) {
    const tick = async () => {
      try {
        const result = await job.run();
        if (result && Object.keys(result).length) {
          console.log(`[job:${job.name}]`, JSON.stringify(result).slice(0, 200));
        }
      } catch (err) {
        console.error(`[job:${job.name}] failed:`, err.message);
      }
    };
    setTimeout(tick, 5_000);
    setInterval(tick, job.everyMs);
  }

  scheduleDailyBrief();
}

/** Runs the brief once a day at 06:00 local time. */
function scheduleDailyBrief() {
  const run = async () => {
    try {
      const { rows } = await query(`select id from departments`);
      await buildDailyBrief(null);
      for (const d of rows) await buildDailyBrief(d.id);
      console.log("[job:brief] generated");
    } catch (err) {
      console.error("[job:brief] failed:", err.message);
    }
  };

  const next = new Date();
  next.setHours(6, 0, 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 1);

  setTimeout(() => {
    run();
    setInterval(run, 24 * 3600 * 1000);
  }, next - Date.now());
}
