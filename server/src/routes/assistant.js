import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireAuth, requireMinRole } from "../middleware/auth.js";
import { wrap } from "../middleware/errors.js";
import { matchIntent, answerFrom, ASSISTANT_INTENTS } from "../services/narrate.js";

const router = Router();
router.use(requireAuth, requireMinRole("super_admin"));

/**
 * Answers administrators' questions from live data.
 *
 * Not natural language understanding. A fixed set of questions matched on
 * keywords, each answered by a real query — which covers what the suggestion
 * chips offer and says plainly when it cannot help.
 *
 * That is a narrower thing than a language model over the database, and better
 * suited to the job. Every figure is a query result, so the answer cannot be
 * wrong; it costs nothing; and it does not stop working when a provider retires
 * a model, which is how this feature broke before.
 *
 * The honest limit is stated in the response: it answers these four questions
 * and nothing else. A fluent answer to a misread question would be worse than
 * an admission.
 */
const QUERIES = {
  worst_ward: (scope) =>
    query(
      `select w.code as label,
              count(*) filter (where c.status not in ('resolved','rejected','withdrawn'))::int as open,
              count(*) filter (where c.sla_deadline < now() and c.resolved_at is null)::int    as overdue
       from complaints c
       join wards w on w.id = c.ward_id
       where ($1::int is null or c.department_id = $1) and w.code <> 'MUMBAI'
       group by w.code having count(*) > 0
       order by overdue desc, open desc limit 8`,
      [scope]
    ),

  critical_today: (scope) =>
    query(
      `select c.ref as label,
              cat.name as value,
              w.code as note,
              (c.sla_deadline < now()) as overdue
       from complaints c
       left join categories cat on cat.id = c.category_id
       left join wards w on w.id = c.ward_id
       where c.severity = 'critical'
         and c.status not in ('resolved','rejected','withdrawn')
         and ($1::int is null or c.department_id = $1)
       order by c.sla_deadline asc limit 10`,
      [scope]
    ),

  contractor: (scope) =>
    query(
      `select ct.agency as label, ct.contract_no as note,
              count(c.id)::int as total,
              count(c.id) filter (where c.status = 'resolved')::int as resolved,
              count(c.id) filter (where c.sla_deadline < now() and c.resolved_at is null)::int as overdue
       from contracts ct
       left join complaints c on c.contract_id = ct.id
       where ($1::int is null or ct.department_id = $1)
       group by ct.agency, ct.contract_no
       having count(c.id) > 0
       order by overdue desc, total desc limit 8`,
      [scope]
    ),

  officer_load: (scope) =>
    query(
      `select p.full_name as label,
              count(*) filter (where c.status not in ('resolved','rejected','withdrawn'))::int as open,
              round(100.0 * count(*) filter (where c.resolved_at <= c.sla_deadline)
                    / nullif(count(*) filter (where c.resolved_at is not null), 0))            as sla
       from officers o
       join profiles p on p.id = o.id
       left join complaints c on c.assigned_officer = o.id
       where o.active and ($1::int is null or o.department_id = $1)
       group by p.full_name
       order by open desc limit 8`,
      [scope]
    ),
};

router.post(
  "/",
  wrap(async (req, res) => {
    const { question } = z.object({ question: z.string().min(3).max(300) }).parse(req.body);

    const scope = req.user.role === "global_admin" ? null : req.user.departmentId;
    const intent = matchIntent(question);

    if (!intent) {
      // Saying so beats guessing. A confident answer to a misread question is
      // worse than none, because nobody checks it.
      return res.json({
        headline: "I cannot answer that one",
        findings: ASSISTANT_INTENTS.map((i) => ({ label: i.label, value: "" })),
        reading:
          "This answers a fixed set of questions from live queries rather than " +
          "interpreting free text. Those are the ones it knows.",
        action: "",
        unmatched: true,
      });
    }

    const { rows } = await QUERIES[intent.id](scope);

    res.json({
      ...answerFrom(intent, rows),
      // Worth stating on every answer, since figures that look generated invite
      // the question of whether they are.
      grounded: "Every figure came from a query run just now.",
    });
  })
);

/** The questions worth offering, so the chips are not hardcoded in the UI. */
router.get(
  "/suggestions",
  wrap(async (_req, res) => {
    res.json({ suggestions: ASSISTANT_INTENTS.map((i) => i.label) });
  })
);

export default router;
