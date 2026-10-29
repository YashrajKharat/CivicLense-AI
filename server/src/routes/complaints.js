import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { query, transaction } from "../db/pool.js";
import { requireAuth, requireMinRole } from "../middleware/auth.js";
import { wrap, badRequest, notFound } from "../middleware/errors.js";
import { classifyPhoto } from "../services/vision.js";
import { uploadImage, signedUrl } from "../services/storage.js";
import { aiProvider } from "../services/ai/index.js";
import { attachToCluster } from "../services/clustering.js";
import { resolveResponsibility } from "../services/responsibility.js";
import { scoreSeverity } from "../services/severity.js";
import { notify } from "../services/notifications.js";
import { award } from "../services/rewards.js";
import { executeAIAutoAssignment } from "../services/aiAssignment.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    file.mimetype.startsWith("image/") ? cb(null, true) : cb(badRequest("Upload a photo.")),
});

const SLA_LABEL = { critical: "12 hours", high: "24 hours", medium: "3 days", low: "7 days" };

/* POST /api/complaints/analyse — classify a photo before the report is filed. */
router.post(
  "/analyse",
  requireAuth,
  upload.single("photo"),
  wrap(async (req, res) => {
    if (!req.file) throw badRequest("Attach a photo to analyse.");

    const analysis = await classifyPhoto({
      base64: req.file.buffer.toString("base64"),
      mimeType: req.file.mimetype,
      context: req.body.lat ? `reported near ${req.body.lat}, ${req.body.lng} in Mumbai` : null,
    });

    const { rows } = await query(
      `select id from categories where lower(name) = lower($1) limit 1`,
      [analysis.category]
    );

    // The photo has to be persisted here, not at submit time. The client only
    // holds a Blob URL that dies with the page, so without this the complaint
    // was created with no image at all and every report looked blank.
    const stored = await uploadImage({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      prefix: `pending/${req.user.id}`,
      role: "report",
    });

    const { rows: saved } = await query(
      `insert into pending_analyses (citizen_id, payload, storage_path)
       values ($1, $2, $3) returning id`,
      [req.user.id, analysis, stored.path]
    );

    res.json({
      ...analysis,
      analysis_id: saved[0].id,
      category_id: rows[0]?.id ?? null,
      // Sent so the resident can correct the guess without another round trip.
      categories: (
        await query(
          `select c.id, c.name, d.name as department
           from categories c
           left join departments d on d.id = c.default_department_id
           where c.active
           order by d.name nulls last, c.name`
        )
      ).rows,
      image_url: stored.url,
      description: analysis.description,
      observations: analysis.observations,
      recommended_action: analysis.recommended_action,
      sla_label: SLA_LABEL[analysis.severity],
    });
  })
);

/* POST /api/complaints — file the report. */
const createSchema = z.object({
  analysisId: z.string().uuid(),
  // The resident is standing in front of the thing. If they say the classifier
  // got it wrong, they are the better source.
  categoryOverrideId: z.number().int().nullable().optional(),
  // Withholds the name from officers, administrators and the public. The
  // complaint stays linked to the account so it can still be tracked, earn
  // points and be followed up.
  anonymous: z.boolean().optional(),
  description: z.string().max(2000).optional(),
  language: z.enum(["en", "hi", "mr"]).default("en"),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

router.post(
  "/",
  requireAuth,
  wrap(async (req, res) => {
    const input = createSchema.parse(req.body);

    const { rows: pending } = await query(
      `select payload, storage_path from pending_analyses where id = $1 and citizen_id = $2`,
      [input.analysisId, req.user.id]
    );
    if (!pending[0]) throw notFound("Analysis");
    const analysis = pending[0].payload;

    const { rows: cat } = await query(
      `select id from categories where lower(name) = lower($1) limit 1`,
      [analysis.category]
    );

    const aiCategoryId = cat[0]?.id ?? null;
    const corrected =
      input.categoryOverrideId != null && input.categoryOverrideId !== aiCategoryId;
    const categoryId = corrected ? input.categoryOverrideId : aiCategoryId;

    // A corrected category means the department, the SLA and the responsible
    // party all change with it — otherwise a paan stain would still route to
    // Water Supply on the classifier's original guess.

    // Severity is computed here, not asked of the model. The inputs are the
    // category, what is nearby, how many people have reported it and how long
    // it has waited — none of which are visible in a photograph.
    const { rows: catRow } = await query(
      `select code from categories where id = $1`, [categoryId]
    );

    const { rows: near } = await query(
      `select
         (select round(st_distance(a.geom, $1::geography))::int
          from assets a where a.kind = 'school'
          order by a.geom <-> $1::geography limit 1) as school_m,
         (select round(st_distance(a.geom, $1::geography))::int
          from assets a where a.kind = 'market'
          order by a.geom <-> $1::geography limit 1) as market_m`,
      [`SRID=4326;POINT(${input.lng} ${input.lat})`]
    );

    const scored = scoreSeverity({
      categoryCode: catRow[0]?.code || "OTHER",
      createdAt: new Date(),
      reportCount: 1,
      nearby: near[0] || {},
    });

    const responsibility = await resolveResponsibility({
      lat: input.lat, lng: input.lng, categoryId,
    });

    const result = await transaction(async (client) => {
      const { rows: created } = await client.query(
        `insert into complaints
           (citizen_id, description_original, description_lang, location, ward_id,
            category_id, department_id, contract_id, ai_confidence, severity,
            severity_score, authenticity, authenticity_confidence, establishment_id,
            flagged_not_civic, triage_note, ai_category_id, category_corrected,
            corrected_at, anonymous, status, sla_deadline)
         values ($1,$2,$3, st_setsrid(st_makepoint($4,$5),4326)::geography,
                 (select id from wards where code = $6), $7,$8,$9,$10,$11::severity,$12,$13,$14,$15,$16,$17,
                 $18,$19, case when $19 then now() end, $20, 'ai_analysis',
                 now() + (case $11::text when 'critical' then 12 when 'high' then 24 when 'medium' then 72 else 168 end || ' hours')::interval)
         returning id, ref, created_at`,
        [
          req.user.id, input.description || null, input.language,
          input.lng, input.lat, responsibility.ward_code,
          categoryId, responsibility.department_id, responsibility.contract_id,
          analysis.confidence, scored.severity, scored.score,
          analysis.authenticity, analysis.authenticity_confidence,
          responsibility.establishment_id,
          analysis.is_civic_issue === false,
          analysis.not_civic_reason ?? null,
          aiCategoryId,
          corrected,
          input.anonymous === true,
        ]
      );

      const complaint = created[0];

      if (pending[0].storage_path) {
        await client.query(
          `insert into complaint_images (complaint_id, storage_path, role, uploaded_by)
           values ($1, $2, 'report', $3)`,
          [complaint.id, pending[0].storage_path, req.user.id]
        );
      }

      await client.query(
        `insert into complaint_ai_analysis (complaint_id, model, raw_response, severity_factors, summary)
         values ($1, $2, $3, $4, $5)`,
        [complaint.id, `${aiProvider.name}:${aiProvider.model}`, analysis, JSON.stringify(analysis.severity_factors), analysis.summary]
      );

      const cluster = await attachToCluster(client, {
        lat: input.lat, lng: input.lng,
        categoryId, departmentId: responsibility.department_id,
        description: input.description, embedding: null,
      });

      await client.query(`update complaints set cluster_id = $1 where id = $2`, [
        cluster.clusterId, complaint.id,
      ]);

      await client.query(`delete from pending_analyses where id = $1`, [input.analysisId]);

      return { ...complaint, cluster };
    });

    // Points and badges were written and never awarded — rewards.js exported
    // award() and checkBadges() that nothing ever called, so every resident sat
    // at zero and no badge could ever be earned.
    // `result`, not `rows` — the transaction returns the created complaint and
    // `rows` is not in scope here at all, so every filing threw a ReferenceError
    // after the record had already been written.
    //
    // Awarded outside the transaction on purpose: the report is filed and
    // committed by this point, and a failure to add points should not roll back
    // somebody's complaint. Logged rather than thrown for the same reason.
    try {
      await award(
        req.user.id,
        scored.severity === "critical" ? "critical_report" : "valid_report",
        result.id
      );
    } catch (err) {
      console.error("[rewards] could not award points for", result.ref, err.message);
    }

    res.status(201).json({ ref: result.ref, cluster: result.cluster });
  })
);

/* GET /api/complaints/mine */
router.get(
  "/mine",
  requireAuth,
  wrap(async (req, res) => {
    const { rows } = await query(
      `select c.ref, c.status, c.severity, c.created_at, w.code as ward_code,
              cat.name as category, c.address,
              (select storage_path from complaint_images i
               where i.complaint_id = c.id and i.role = 'report' limit 1) as image_path,
              (select storage_path from complaint_images i
               where i.complaint_id = c.id and i.role = 'after' limit 1) as after_path,
              d.name as department_name,
              off.full_name as officer_name, off.email as officer_email,
              c.rework_count, c.last_rejection_reason, c.last_rejected_at,
              ct.contract_no, ct.agency,
              e.name as establishment_name, e.owner_name,
              (select row_to_json(r) from complaint_reviews r where r.complaint_id = c.id) as review,
              (select json_agg(json_build_object(
                 'attempt', rp.attempt, 'rejected', rp.rejected, 'reason', rp.rejection_reason,
                 'at', rp.created_at, 'rejected_at', rp.rejected_at,
                 'verdict', rp.ai_verdict, 'scene_match', rp.ai_scene_match,
                 'image_path', (select storage_path from complaint_images i
                                where i.id = rp.after_image_id)
               ) order by rp.attempt desc)
               from resolution_proofs rp where rp.complaint_id = c.id) as attempts,
              coalesce(
                (select json_agg(json_build_object('to_status', h.to_status, 'at', h.at) order by h.at)
                 from complaint_status_history h where h.complaint_id = c.id), '[]'
              ) as history
       from complaints c
       left join wards w on w.id = c.ward_id
       left join categories cat on cat.id = c.category_id
       left join departments d on d.id = c.department_id
       left join contracts ct on ct.id = c.contract_id
       left join establishments e on e.id = c.establishment_id
       left join profiles off on off.id = c.assigned_officer
       where c.citizen_id = $1
         and c.status <> 'withdrawn'
       order by c.created_at desc`,
      [req.user.id]
    );
    // Storage is private, so every path becomes a short-lived signed URL.
    const complaints = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        image_url: r.image_path ? await signedUrl(r.image_path) : null,
        after_image_url: r.after_path ? await signedUrl(r.after_path) : null,
        attempts: await Promise.all(
          (r.attempts || []).map(async (a) => ({
            ...a,
            image_url: a.image_path ? await signedUrl(a.image_path) : null,
          }))
        ),
      }))
    );

    res.json({ complaints });
  })
);

/* POST /api/complaints/:ref/feedback — only the citizen can close the loop. */
router.post(
  "/:ref/feedback",
  requireAuth,
  wrap(async (req, res) => {
    const { resolved, comment } = z
      .object({ resolved: z.boolean(), comment: z.string().max(1000).optional() })
      .parse(req.body);

    // Captured from inside the transaction. `rows` is scoped to the callback,
    // so reading it afterwards is a ReferenceError — which is what turned a
    // successful confirmation into a 500.
    let awarded = false;
    let complaintId = null;

    await transaction(async (client) => {
      const { rows } = await client.query(
        `select id, status from complaints where ref = $1 and citizen_id = $2`,
        [req.params.ref, req.user.id]
      );
      if (!rows[0]) throw notFound("Complaint");
      if (rows[0].status !== "verification") {
        throw badRequest("This report is not waiting for your confirmation yet.");
      }

      complaintId = rows[0].id;

      await client.query(
        `insert into complaint_feedback (complaint_id, citizen_id, resolved, comment)
         values ($1,$2,$3,$4)
         on conflict (complaint_id) do update set resolved = excluded.resolved`,
        [rows[0].id, req.user.id, resolved, comment || null]
      );

      if (resolved) {
        await client.query(
          `update complaints set status = 'resolved', resolved_at = now() where id = $1`,
          [rows[0].id]
        );
      } else {
        /**
         * A rejection has to start a visible cycle, not just flip a status.
         * The officer is told what was wrong, the proof they submitted is
         * marked rejected rather than deleted — the history is the point — and
         * the count is carried on the complaint so administrators can see which
         * jobs keep coming back.
         */
        await client.query(
          `update resolution_proofs
           set rejected = true, rejected_at = now(), rejection_reason = $2
           where complaint_id = $1 and rejected = false`,
          [rows[0].id, comment || "The resident says the problem is still there."]
        );

        await client.query(
          `update complaints
           set status = 'reopened',
               resolved_at = null,
               escalation_level = escalation_level + 1,
               rework_count = rework_count + 1,
               last_rejection_reason = $2,
               last_rejected_at = now()
           where id = $1`,
          [rows[0].id, comment || null]
        );
      }

      // award() handles the points, the reward_events row and the badge check
      // together. The bare UPDATE here moved the number without recording why,
      // so a resident's total could not be explained from their history.
      if (resolved) awarded = true;
    });

    // Outside the transaction: the confirmation is committed by now, and a
    // failure to add points should not undo somebody's confirmation.
    if (awarded && complaintId) {
      try {
        await award(req.user.id, "confirmed_resolution", complaintId);
      } catch (err) {
        console.error("[rewards] could not award points for", req.params.ref, err.message);
      }
    }

    // Tell the officer directly. Discovering a rejection by noticing a job
    // reappear in the queue is not good enough.
    if (!resolved) {
      const { rows: job } = await query(
        `select assigned_officer, ref from complaints where ref = $1`, [req.params.ref]
      );
      if (job[0]?.assigned_officer) {
        await notify({
          userId: job[0].assigned_officer,
          kind: "reopened",
          complaintId: rows[0]?.id,
          context: { ref: job[0].ref },
        });
      }
    }

    res.json({ ok: true });
  })
);

/* POST /api/complaints/:ref/assign — administrators only. Overrides are logged. */
router.post(
  "/:ref/assign",
  requireAuth,
  wrap(async (req, res) => {
    if (!["super_admin", "global_admin"].includes(req.user.role)) {
      throw badRequest("Only administrators can assign work.");
    }
    const { officerId, overrodeSuggestion } = z
      .object({ officerId: z.string().uuid(), overrodeSuggestion: z.boolean().optional() })
      .parse(req.body);

    await transaction(async (client) => {
      const { rows } = await client.query(
        `select id, status, citizen_id, ref from complaints where ref = $1`,
        [req.params.ref]
      );
      if (!rows[0]) throw notFound("Complaint");

      await client.query(
        `update complaints set assigned_officer = $2, status = 'assigned' where id = $1`,
        [rows[0].id, officerId]
      );
      await client.query(
        `insert into complaint_status_history (complaint_id, from_status, to_status, actor)
         values ($1,$2,'assigned',$3)`,
        [rows[0].id, rows[0].status, req.user.id]
      );
      await client.query(
        `insert into audit_logs (actor, action, entity, entity_id, after)
         values ($1, $2, 'complaints', $3, $4)`,
        [
          req.user.id,
          overrodeSuggestion ? "assign.override" : "officer.assign",
          rows[0].ref,
          JSON.stringify({ officer_id: officerId }),
        ]
      );
    });

    res.json({ ok: true });
  })
);

/* POST /api/complaints/:ref/auto-assign — AI evaluates metrics and assigns the optimal officer. */
router.post(
  "/:ref/auto-assign",
  requireAuth,
  wrap(async (req, res) => {
    if (!["super_admin", "global_admin", "officer"].includes(req.user.role)) {
      throw badRequest("Only authorized staff can trigger AI auto-assignment.");
    }
    const result = await executeAIAutoAssignment(req.params.ref, req.user.id);
    res.json(result);
  })
);

/* GET /api/complaints/:ref — full record for administrators. */
router.get(
  "/:ref",
  requireAuth,
  wrap(async (req, res) => {
    const { rows } = await query(
      `select c.*, cat.name as category, w.code as ward_code, d.name as department_name,
              st_y(c.location::geometry) as lat, st_x(c.location::geometry) as lng,
              off.full_name as officer,
              cl.ref as cluster_ref, a.summary as ai_summary, a.severity_factors,
              ct.contract_no, ct.agency, ct.ends_on as contract_ends,
              e.name as establishment_name, e.kind::text as establishment_kind,
              e.owner_name, e.owner_phone, e.licence_no, e.licence_authority,
              cat2.responsible_party,
              c.category_corrected, aicat.name as ai_category_name,
              (select row_to_json(r) from complaint_reviews r where r.complaint_id = c.id) as review,
              (select json_agg(json_build_object(
                 'attempt', rp.attempt, 'rejected', rp.rejected, 'reason', rp.rejection_reason,
                 'at', rp.created_at, 'rejected_at', rp.rejected_at,
                 'verdict', rp.ai_verdict, 'scene_match', rp.ai_scene_match,
                 'image_path', (select storage_path from complaint_images i
                                where i.id = rp.after_image_id)
               ) order by rp.attempt desc)
               from resolution_proofs rp where rp.complaint_id = c.id) as attempts,
              p.full_name as citizen_name, p.email as citizen_email, p.phone as citizen_phone,
              off.email as officer_email
       from complaints c
       left join categories cat on cat.id = c.category_id
       left join wards w on w.id = c.ward_id
       left join departments d on d.id = c.department_id
       left join clusters cl on cl.id = c.cluster_id
       left join complaint_ai_analysis a on a.complaint_id = c.id
       left join contracts ct on ct.id = c.contract_id
       left join establishments e on e.id = c.establishment_id
       left join categories cat2 on cat2.id = c.category_id
       left join categories aicat on aicat.id = c.ai_category_id
       left join profiles p on p.id = c.citizen_id
       left join profiles off on off.id = c.assigned_officer
       where c.ref = $1`,
      [req.params.ref]
    );
    const complaint = rows[0];
    if (!complaint) throw notFound("Complaint");

    const [images, proof, audit] = await Promise.all([
      query(`select role, storage_path from complaint_images where complaint_id = $1`, [complaint.id]),
      query(`select * from resolution_proofs where complaint_id = $1`, [complaint.id]),
      query(
        `select h.id, h.to_status, h.at, p.full_name as actor_name, h.note
         from complaint_status_history h
         left join profiles p on p.id = h.actor
         where h.complaint_id = $1 order by h.at`,
        [complaint.id]
      ),
    ]);

    const url = async (role) => {
      const found = images.rows.find((i) => i.role === role);
      return found ? signedUrl(found.storage_path) : null;
    };
    const [beforeUrl, afterUrl] = await Promise.all([url("report"), url("after")]);

    // Every attempt needs its own signed URL; the timeline shows them in order.
    const attempts = await Promise.all(
      (complaint.attempts || []).map(async (a) => ({
        ...a,
        image_url: a.image_path ? await signedUrl(a.image_path) : null,
      }))
    );

    res.json({
      ...complaint,
      before_image_url: beforeUrl,
      after_image_url: afterUrl,
      attempts,
      proof: proof.rows[0] || null,
      duplicate_risk: complaint.is_duplicate ? "High" : "Low",
      authenticity_label: complaint.authenticity?.replace(/_/g, " "),
      sla_label: complaint.resolved_at
        ? new Date(complaint.resolved_at) <= new Date(complaint.sla_deadline) ? "Met" : "Missed"
        : new Date(complaint.sla_deadline) < new Date() ? "Breached" : "Within target",
      audit: audit.rows.map((a) => ({
        ...a,
        description: a.note || `Status changed to ${a.to_status.replace(/_/g, " ")}`,
      })),
      responsibility: {
        ward_code: complaint.ward_code,
        department_name: complaint.department_name,
        responsible_party: complaint.responsible_party,
        contract_no: complaint.contract_no,
        agency: complaint.agency,
        contract_ends: complaint.contract_ends,
        establishment_name: complaint.establishment_name,
        establishment_kind: complaint.establishment_kind,
        owner_name: complaint.owner_name,
        licence_no: complaint.licence_no,
        licence_authority: complaint.licence_authority,
      },
    });
  })
);

/**
 * POST /api/complaints/:ref/review
 *
 * A thumbs-up closed the complaint but recorded nothing about the quality of
 * the work, so a department could hit its SLA while doing a bad job. Only the
 * resident who filed it may review, and only once it is genuinely resolved.
 */
router.post(
  "/:ref/review",
  requireAuth,
  wrap(async (req, res) => {
    const input = z
      .object({
        rating: z.number().int().min(1).max(5),
        speed_rating: z.number().int().min(1).max(5).optional(),
        quality_rating: z.number().int().min(1).max(5).optional(),
        comment: z.string().max(1000).optional(),
        would_report_again: z.boolean().optional(),
      })
      .parse(req.body);

    const { rows } = await query(
      `select id, status from complaints where ref = $1 and citizen_id = $2`,
      [req.params.ref, req.user.id]
    );
    if (!rows[0]) throw notFound("Complaint");
    if (rows[0].status !== "resolved") {
      throw badRequest("You can review this once it has been resolved.");
    }

    await query(
      `insert into complaint_reviews
         (complaint_id, citizen_id, rating, speed_rating, quality_rating, comment, would_report_again)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (complaint_id) do update
         set rating = excluded.rating,
             speed_rating = excluded.speed_rating,
             quality_rating = excluded.quality_rating,
             comment = excluded.comment,
             would_report_again = excluded.would_report_again,
             created_at = now()`,
      [rows[0].id, req.user.id, input.rating, input.speed_rating ?? null,
       input.quality_rating ?? null, input.comment ?? null, input.would_report_again ?? null]
    );

    res.status(201).json({ ok: true });
  })
);

/**
 * DELETE /api/complaints/:ref
 *
 * A resident withdraws their own report. Refused once an officer is assigned,
 * because work may already be scheduled, and refused once it is part of a group,
 * because other people's reports are attached to it — withdrawing then would
 * remove evidence that is no longer only theirs.
 */
router.delete(
  "/:ref",
  requireAuth,
  wrap(async (req, res) => {
    const { rows } = await query(
      `select id, ref, status, assigned_officer, cluster_id
       from complaints where ref = $1 and citizen_id = $2`,
      [req.params.ref, req.user.id]
    );

    const complaint = rows[0];
    if (!complaint) throw notFound("Complaint");

    if (complaint.assigned_officer) {
      throw badRequest(
        "An officer is already working on this. Let them finish — you can reject the " +
          "outcome if it is not actually fixed."
      );
    }
    if (["resolved", "verification", "work_started"].includes(complaint.status)) {
      throw badRequest("Work has already started on this report.");
    }
    if (complaint.cluster_id) {
      throw badRequest(
        "Other residents reported the same problem and their reports are grouped with " +
          "yours. Withdrawing yours would not remove the group."
      );
    }

    await transaction(async (client) => {
      await client.query(
        `update complaints set status = 'withdrawn', updated_at = now() where id = $1`,
        [complaint.id]
      );

      await client.query(
        `insert into complaint_status_history (complaint_id, from_status, to_status, actor, note)
         values ($1, $2, 'withdrawn', $3, 'Withdrawn by the resident who filed it')`,
        [complaint.id, complaint.status, req.user.id]
      );

      // The points were awarded for filing something now withdrawn.
      await client.query(
        `delete from reward_events where complaint_id = $1 and reason = 'valid_report'`,
        [complaint.id]
      );
    });

    res.json({ ok: true, ref: complaint.ref });
  })
);

/**
 * POST /api/complaints/:ref/reject
 *
 * An administrator dismisses a report that is not a civic matter — a photograph
 * of a meal, somebody's living room, a duplicate of a report already closed.
 *
 * A reason is required, and the resident is told. Silently dropping a report
 * would be the worst outcome available: the person who filed it keeps checking
 * a page that never changes, learns nothing, and stops reporting. A rejection
 * they can read is recoverable; silence is not.
 */
router.post(
  "/:ref/reject",
  requireAuth,
  requireMinRole("super_admin"),
  wrap(async (req, res) => {
    const { reason } = z
      .object({ reason: z.string().min(5).max(500) })
      .parse(req.body);

    const { rows } = await query(
      `select c.id, c.ref, c.status, c.citizen_id
       from complaints c
       where c.ref = $1 and ($2::int is null or c.department_id = $2)`,
      [req.params.ref, req.user.role === "global_admin" ? null : req.user.departmentId]
    );

    const complaint = rows[0];
    if (!complaint) throw notFound("Complaint");
    if (complaint.status === "resolved") {
      throw badRequest("This is already resolved. Rejecting it now would erase a closed record.");
    }

    await transaction(async (client) => {
      await client.query(
        `update complaints
         set status = 'rejected', review_decision = 'rejected',
             triage_note = $2, updated_at = now()
         where id = $1`,
        [complaint.id, reason]
      );

      await client.query(
        `insert into complaint_status_history (complaint_id, from_status, to_status, actor, note)
         values ($1, $2, 'rejected', $3, $4)`,
        [complaint.id, complaint.status, req.user.id, reason]
      );

      // The points were for a report that has now been dismissed.
      await client.query(
        `delete from reward_events where complaint_id = $1 and reason = 'valid_report'`,
        [complaint.id]
      );

      await client.query(
        `insert into audit_logs (actor, action, entity, entity_id, after)
         values ($1, 'complaint.rejected', 'complaints', $2, $3)`,
        [req.user.id, complaint.ref, JSON.stringify({ reason })]
      );
    });

    if (complaint.citizen_id) {
      await notify({
        userId: complaint.citizen_id,
        kind: "rejected",
        complaintId: complaint.id,
        context: { ref: complaint.ref, reason },
      });
    }

    res.json({ ok: true });
  })
);

export default router;
