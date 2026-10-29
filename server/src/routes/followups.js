import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { wrap, notFound } from "../middleware/errors.js";

const router = Router();
router.use(requireAuth);

/**
 * GET /api/followups?category=&lang=
 *
 * A photograph often cannot answer what an officer needs to know — how long it
 * has been there, whether it is blocking the road. Those answers come from the
 * resident, in their own language, at the moment they are standing in front of
 * it.
 *
 * Questions live in the database, so a department can add one for its own
 * category without a deploy.
 */
router.get(
  "/",
  wrap(async (req, res) => {
    const { category, lang } = z
      .object({
        category: z.coerce.number().int().nullable().optional(),
        lang: z.enum(["en", "hi", "mr"]).default("en"),
      })
      .parse(req.query);

    // questions_for_category returns the one universal question plus whatever
    // is attached to this category. A food complaint is never asked whether it
    // is blocking traffic, because that question is not attached to it.
    const { rows } = await query(
      `select id, position, prompt, options from questions_for_category($1)`,
      [category ?? null]
    );

    res.json({
      questions: rows.map((q) => ({
        id: q.id,
        // Fall back to English rather than showing a blank prompt when a
        // translation is missing — an untranslated question still works.
        prompt: q.prompt[lang] || q.prompt.en,
        options: q.options.map((o) => ({
          value: o.value,
          label: o.label[lang] || o.label.en,
        })),
      })),
    });
  })
);

/**
 * POST /api/followups/:ref
 * Answers adjust the severity the model produced. A resident saying a pothole
 * blocks the road should move the priority, not sit in a text field nobody reads.
 */
router.post(
  "/:ref",
  wrap(async (req, res) => {
    const { answers } = z
      .object({
        answers: z
          .array(
            z.object({
              question_id: z.number().int(),
              value: z.string(),
              // Kept because the wording a resident chose carries meaning an
              // officer may want; a translated paraphrase is not the same thing.
              language: z.enum(["en", "hi", "mr"]).optional(),
            })
          )
          .max(10),
      })
      .parse(req.body);

    const { rows } = await query(
      `select id, severity_score from complaints where ref = $1 and citizen_id = $2`,
      [req.params.ref, req.user.id]
    );
    if (!rows[0]) throw notFound("Complaint");

    let delta = 0;

    for (const answer of answers) {
      const { rows: q } = await query(`select options from followup_questions where id = $1`, [
        answer.question_id,
      ]);
      const option = q[0]?.options?.find((o) => o.value === answer.value);
      if (!option) continue;

      delta += option.severity_delta || 0;

      await query(
        `insert into complaint_followups
           (complaint_id, question_id, answer_value, severity_delta, language)
         values ($1,$2,$3,$4,$5)`,
        [rows[0].id, answer.question_id, answer.value, option.severity_delta || 0,
         answer.language || "en"]
      );
    }

    if (delta !== 0) {
      const { rows: updated } = await query(
        `update complaints
         set severity_score = least(100, greatest(0, severity_score + $2)),
             severity = case
               when least(100, severity_score + $2) >= 80 then 'critical'
               when least(100, severity_score + $2) >= 60 then 'high'
               when least(100, severity_score + $2) >= 35 then 'medium'
               else 'low' end
         where id = $1
         returning severity, severity_score`,
        [rows[0].id, delta]
      );
      return res.json({ ok: true, adjusted_by: delta, ...updated[0] });
    }

    res.json({ ok: true, adjusted_by: 0 });
  })
);

export default router;
