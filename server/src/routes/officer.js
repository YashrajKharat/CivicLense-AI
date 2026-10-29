import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { query, transaction } from "../db/pool.js";
import { requireAuth, requireMinRole } from "../middleware/auth.js";
import { wrap, notFound, badRequest } from "../middleware/errors.js";
import { uploadImage, downloadAsBase64, signedUrl } from "../services/storage.js";
import { verifyResolution } from "../services/vision.js";
import { notify } from "../services/notifications.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

router.use(requireAuth, requireMinRole("officer"));

/* GET /api/officer/queue — the officer's own work, most urgent first. */
router.get(
  "/queue",
  wrap(async (req, res) => {
    const { rows } = await query(
      `select c.ref, c.status, c.severity, c.created_at, c.sla_deadline,
              cat.name as category, w.code as ward_code, c.address,
              st_y(c.location::geometry) as lat, st_x(c.location::geometry) as lng,
              cl.ref as cluster_ref, cl.report_count as cluster_size,
              (select storage_path from complaint_images i
               where i.complaint_id = c.id and i.role = 'report' limit 1) as image_path,
              extract(epoch from (c.sla_deadline - now()))/3600 as hours_left,
              c.rework_count, c.last_rejection_reason
       from complaints c
       left join categories cat on cat.id = c.category_id
       left join wards w on w.id = c.ward_id
       left join clusters cl on cl.id = c.cluster_id
       where c.assigned_officer = $1 and c.status not in ('resolved','rejected')
       order by
         case c.severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,
         c.sla_deadline asc`,
      [req.user.id]
    );

    const jobs = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        image_url: r.image_path ? await signedUrl(r.image_path) : null,
        sla: r.hours_left < 0 ? "breached" : r.hours_left < 6 ? "approaching" : "within",
      }))
    );
    res.json({ jobs });
  })
);

/* GET /api/officer/jobs/:ref */
router.get(
  "/jobs/:ref",
  wrap(async (req, res) => {
    const { rows } = await query(
      `select c.*, cat.name as category, w.code as ward_code, d.name as department_name,
              a.summary as ai_summary, a.severity_factors,
              st_y(c.location::geometry) as lat, st_x(c.location::geometry) as lng,
              (select storage_path from complaint_images where complaint_id = c.id and role = 'report' limit 1) as report_image,
              case when c.anonymous then null else p.full_name end as citizen_name, c.anonymous, p.language as citizen_language,
              -- What the resident said about this officer's own work. Ratings
              -- were collected, aggregated onto their record, and never shown
              -- to them — which is the one place the feedback could change what
              -- somebody does next time.
              (select row_to_json(r) from complaint_reviews r where r.complaint_id = c.id) as review,
              c.rework_count, c.last_rejection_reason, c.last_rejected_at,
              (select json_agg(json_build_object(
                 'attempt', rp.attempt, 'rejected', rp.rejected,
                 'reason', rp.rejection_reason, 'at', rp.created_at,
                 'rejected_at', rp.rejected_at, 'verdict', rp.ai_verdict,
                 'scene_match', rp.ai_scene_match,
                 'image_path', (select storage_path from complaint_images i
                                where i.id = rp.after_image_id)
               ) order by rp.attempt desc)
               from resolution_proofs rp where rp.complaint_id = c.id) as attempts
       from complaints c
       left join categories cat on cat.id = c.category_id
       left join wards w on w.id = c.ward_id
       left join departments d on d.id = c.department_id
       left join complaint_ai_analysis a on a.complaint_id = c.id
       left join profiles p on p.id = c.citizen_id
       where c.ref = $1`,
      [req.params.ref]
    );
    if (!rows[0]) throw notFound("Job");
    res.json({
      ...rows[0],
      report_image_url: rows[0].report_image ? await signedUrl(rows[0].report_image) : null,
      attempts: await Promise.all(
        (rows[0].attempts || []).map(async (a) => ({
          ...a,
          image_url: a.image_path ? await signedUrl(a.image_path) : null,
        }))
      ),
    });
  })
);

/* POST /api/officer/jobs/:ref/status — accept, start, reject. */
const TRANSITIONS = {
  accepted: ["assigned"],
  work_started: ["accepted", "assigned"],
  rejected: ["assigned", "accepted"],
};

router.post(
  "/jobs/:ref/status",
  wrap(async (req, res) => {
    const { status, note } = z
      .object({ status: z.enum(["accepted", "work_started", "rejected"]), note: z.string().max(1000).optional() })
      .parse(req.body);

    await transaction(async (client) => {
      const { rows } = await client.query(
        `select id, status, citizen_id, ref from complaints where ref = $1 and assigned_officer = $2`,
        [req.params.ref, req.user.id]
      );
      const complaint = rows[0];
      if (!complaint) throw notFound("Job");

      if (!TRANSITIONS[status].includes(complaint.status)) {
        throw badRequest(`This job cannot move from ${complaint.status} to ${status}.`);
      }
      if (status === "rejected" && !note) {
        throw badRequest("Explain why you are rejecting this job.");
      }

      await client.query(`update complaints set status = $2 where id = $1`, [complaint.id, status]);
      await client.query(
        `insert into complaint_status_history (complaint_id, from_status, to_status, actor, note)
         values ($1,$2,$3,$4,$5)`,
        [complaint.id, complaint.status, status, req.user.id, note || null]
      );

      if (status === "work_started") {
        await notify({
          userId: complaint.citizen_id,
          kind: "work_started",
          complaintId: complaint.id,
          context: { ref: complaint.ref },
        });
      }
    });

    res.json({ ok: true });
  })
);

/* POST /api/officer/jobs/:ref/proof — upload the after photo and run the evidence check. */
router.post(
  "/jobs/:ref/proof",
  upload.single("photo"),
  wrap(async (req, res) => {
    if (!req.file) throw badRequest("Attach the after photo.");

    const { rows } = await query(
      `select c.id, c.ref, c.citizen_id, c.status,
              (select storage_path from complaint_images where complaint_id = c.id and role = 'report' limit 1) as before_path
       from complaints c where c.ref = $1 and c.assigned_officer = $2`,
      [req.params.ref, req.user.id]
    );
    const complaint = rows[0];
    if (!complaint) throw notFound("Job");
    // A reopened job goes straight back to evidence: the officer has already
    // accepted and started it once, and making them repeat those steps to fix
    // their own work is friction with no purpose.
    if (!["work_started", "reopened"].includes(complaint.status)) {
      throw badRequest(
        complaint.status === "verification"
          ? "Proof is already submitted and waiting on the resident."
          : "Start the work before uploading proof."
      );
    }

    const after = await uploadImage({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      prefix: complaint.ref,
      role: "after",
    });

    /**
     * The before/after comparison is assistive. It informs a human reviewer; it
     * does not decide anything and never closes a complaint.
     *
     * So it must not be able to block the upload. Letting it throw meant an
     * unavailable model provider — or a complaint filed before photos were
     * stored — rejected work an officer had already done in the field, and lost
     * their photo with it. Failures are recorded as "not available" and the job
     * moves on.
     */
    let check = null;
    let checkNote = null;

    if (!complaint.before_path) {
      checkNote = "No original photo on file, so there was nothing to compare against.";
    } else {
      try {
        const before = await downloadAsBase64(complaint.before_path);
        check = await verifyResolution({
          before,
          after: { base64: req.file.buffer.toString("base64"), mimeType: req.file.mimetype },
        });
      } catch (err) {
        console.warn(`[proof] comparison unavailable for ${complaint.ref}: ${err.message}`);
        checkNote = "The automated comparison was unavailable. A reviewer will compare the photos.";
      }
    }

    await transaction(async (client) => {
      const { rows: img } = await client.query(
        `insert into complaint_images (complaint_id, storage_path, role, uploaded_by)
         values ($1,$2,'after',$3) returning id`,
        [complaint.id, after.path, req.user.id]
      );

      // Each attempt is kept. The rejected one is the record of what went
      // wrong, so it is superseded rather than overwritten.
      const { rows: prior } = await client.query(
        `select coalesce(max(attempt), 0) as last from resolution_proofs where complaint_id = $1`,
        [complaint.id]
      );

      await client.query(
        `insert into resolution_proofs
           (complaint_id, after_image_id, officer_id, notes, ai_scene_match,
            ai_change_detected, ai_verdict, ai_verdict_summary, attempt)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          complaint.id, img[0].id, req.user.id, req.body.notes || null,
          check?.scene_match ?? null, check?.change_detected ?? null,
          check?.verdict ?? null, check?.summary ?? checkNote,
          Number(prior[0].last) + 1,
        ]
      );

      await client.query(`update complaints set status = 'verification' where id = $1`, [complaint.id]);
      await client.query(
        `insert into complaint_status_history (complaint_id, from_status, to_status, actor, note)
         values ($1,$2,'verification',$3,$4)`,
        [complaint.id, complaint.status, req.user.id,
         complaint.status === "reopened" ? "Fresh evidence after the resident rejected the previous attempt" : null]
      );
    });

    await notify({
      userId: complaint.citizen_id,
      kind: "verify",
      complaintId: complaint.id,
      context: { ref: complaint.ref },
    });

    res.status(201).json({ image: after, check, note: checkNote });
  })
);

/* GET /api/officer/performance */
router.get(
  "/performance",
  wrap(async (req, res) => {
    const { rows } = await query(
      `select
         count(*) filter (where status not in ('resolved','rejected')) as open_cases,
         count(*) filter (where status = 'resolved')                    as resolved,
         round(avg(extract(epoch from (resolved_at - created_at))/86400.0)::numeric, 1) as avg_days,
         round(100.0 * count(*) filter (where resolved_at <= sla_deadline)
               / nullif(count(*) filter (where resolved_at is not null), 0)) as sla,
         (select round(avg(rating)::numeric,1) from complaint_feedback f
          join complaints c2 on c2.id = f.complaint_id where c2.assigned_officer = $1) as rating
       from complaints where assigned_officer = $1`,
      [req.user.id]
    );

    const { rows: weekly } = await query(
      `select to_char(date_trunc('week', resolved_at), 'DD Mon') as week, count(*) as resolved
       from complaints
       where assigned_officer = $1 and resolved_at > now() - interval '8 weeks'
       group by 1 order by min(resolved_at)`,
      [req.user.id]
    );

    res.json({ ...rows[0], weekly });
  })
);

export default router;
