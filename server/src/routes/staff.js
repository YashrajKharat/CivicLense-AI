import { Router } from "express";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { query } from "../db/pool.js";
import { requireAuth, requireMinRole, canApprove, ROLE_LABEL } from "../middleware/auth.js";
import { wrap, badRequest, notFound } from "../middleware/errors.js";

const router = Router();

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const GOV = /@([a-z0-9-]+\.)*(gov\.in|nic\.in)$/i;

/* Public: the department list, so the request form can be rendered. */
router.get(
  "/departments",
  wrap(async (_req, res) => {
    const { rows } = await query(`select id, name, code from departments order by name`);
    res.json({ departments: rows });
  })
);

/**
 * POST /api/staff/register — create the account and file the access request in
 * one call.
 *
 * Done server-side with the service-role key so the account can be marked
 * confirmed immediately. Supabase's normal sign-up emails a verification link,
 * which never arrives for a fictional address like r.kumar@mcgm.gov.in and
 * leaves the applicant stranded with no session. Creating the user here also
 * means the account and the request are filed together, rather than the
 * applicant landing in the resident app wondering where the second form went.
 *
 * This grants nothing. The role stays `citizen` until somebody approves it.
 */
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  full_name: z.string().min(2).max(120),
  employee_id: z.string().min(2).max(40),
  requested_role: z.enum(["officer", "super_admin"]),
  department_id: z.number().int(),
  designation: z.string().max(120).optional(),
  phone: z.string().max(20).optional(),
  justification: z.string().max(600).optional(),
});

router.post(
  "/register",
  wrap(async (req, res) => {
    const input = registerSchema.parse(req.body);

    if (!GOV.test(input.email)) {
      throw badRequest(
        "Staff accounts need a government email ending in gov.in or nic.in. Residents register through the public app."
      );
    }

    const { data: created, error } = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true, // no verification link; these are internal accounts
      user_metadata: { full_name: input.full_name },
    });

    if (error) {
      throw badRequest(
        /already|registered|exists/i.test(error.message)
          ? "An account with that email already exists. Sign in instead."
          : "The account could not be created. Check the details and try again."
      );
    }

    const userId = created.user.id;

    // The trigger on auth.users normally creates this; make sure either way.
    await query(
      `insert into profiles (id, full_name, role, language)
       values ($1, $2, 'citizen', 'en')
       on conflict (id) do update set full_name = excluded.full_name`,
      [userId, input.full_name]
    );

    const { rows } = await query(
      `insert into staff_applications
         (user_id, email, full_name, employee_id, requested_role, department_id,
          designation, phone, justification, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending')
       on conflict (user_id) do update
         set status = 'pending', created_at = now(),
             decided_by = null, decided_at = null, decision_note = null
       returning id, status, created_at`,
      [userId, input.email, input.full_name, input.employee_id, input.requested_role,
       input.department_id, input.designation ?? null, input.phone ?? null,
       input.justification ?? null]
    );

    res.status(201).json({
      application: rows[0],
      approver: input.requested_role === "super_admin"
        ? "a global super admin"
        : "your department's super admin",
    });
  })
);

/* Where an applicant's request stands. */
router.get(
  "/my-application",
  requireAuth,
  wrap(async (req, res) => {
    const { rows } = await query(
      `select a.id, a.status, a.requested_role, a.created_at, a.decided_at,
              a.decision_note, d.name as department, p.full_name as decided_by
       from staff_applications a
       left join departments d on d.id = a.department_id
       left join profiles p on p.id = a.decided_by
       where a.user_id = $1`,
      [req.user.id]
    );
    res.json({ application: rows[0] || null });
  })
);

/* An already signed-in user asking for staff access. */
router.post(
  "/apply",
  requireAuth,
  wrap(async (req, res) => {
    const input = registerSchema.omit({ email: true, password: true }).parse(req.body);

    if (!req.user.email || !GOV.test(req.user.email)) {
      throw badRequest(
        "Staff access needs a government email ending in gov.in or nic.in. Sign in with your official account."
      );
    }

    const { rows: existing } = await query(
      `select status from staff_applications where user_id = $1`, [req.user.id]
    );
    if (existing[0]?.status === "pending") throw badRequest("Your request is already awaiting a decision.");
    if (existing[0]?.status === "approved") throw badRequest("You are already approved. Sign out and back in.");

    const { rows } = await query(
      `insert into staff_applications
         (user_id, email, full_name, employee_id, requested_role, department_id,
          designation, phone, justification, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending')
       on conflict (user_id) do update
         set status = 'pending', full_name = excluded.full_name,
             employee_id = excluded.employee_id, requested_role = excluded.requested_role,
             department_id = excluded.department_id, created_at = now(),
             decided_by = null, decided_at = null, decision_note = null
       returning id, status, created_at`,
      [req.user.id, req.user.email, input.full_name, input.employee_id,
       input.requested_role, input.department_id, input.designation ?? null,
       input.phone ?? null, input.justification ?? null]
    );

    res.status(201).json({ application: rows[0] });
  })
);

/* ============================================================
   The approval queue.
   A global admin decides super admin requests; a super admin decides
   officer requests inside their own department. The scoping lives in
   pending_applications_for(), so the API and RLS agree on one rule.
   ============================================================ */
router.use(requireAuth, requireMinRole("super_admin"));

router.get(
  "/applications",
  wrap(async (req, res) => {
    const status = ["pending", "approved", "rejected"].includes(req.query.status)
      ? req.query.status
      : "pending";

    const { rows } =
      status === "pending"
        ? await query(
            `select a.id, a.email, a.full_name, a.employee_id, a.requested_role,
                    a.designation, a.phone, a.justification, a.status,
                    a.created_at, a.decided_at, a.decision_note,
                    d.name as department, null::text as decided_by
             from pending_applications_for($1) a
             left join departments d on d.id = a.department_id`,
            [req.user.id]
          )
        : await query(
            `select a.id, a.email, a.full_name, a.employee_id, a.requested_role,
                    a.designation, a.phone, a.justification, a.status,
                    a.created_at, a.decided_at, a.decision_note,
                    d.name as department, p.full_name as decided_by
             from staff_applications a
             left join departments d on d.id = a.department_id
             left join profiles p on p.id = a.decided_by
             where a.status = $1::staff_request_status
               and a.decided_by = $2
             order by a.decided_at desc
             limit 100`,
            [status, req.user.id]
          );

    const { rows: counts } = await query(
      `select a.status::text, count(*)::int
       from staff_applications a
       join profiles p on p.id = $1
       left join officers o on o.id = $1
       where can_approve(p.role, a.requested_role)
         and (p.role = 'global_admin' or a.department_id = o.department_id)
       group by a.status`,
      [req.user.id]
    );

    res.json({
      applications: rows,
      counts: Object.fromEntries(counts.map((c) => [c.status, c.count])),
      // The UI states plainly which tier this administrator can appoint.
      approves: req.user.approves.map((r) => ROLE_LABEL[r]),
    });
  })
);

router.post(
  "/applications/:id/decide",
  wrap(async (req, res) => {
    const { decision, note } = z
      .object({ decision: z.enum(["approve", "reject"]), note: z.string().max(500).optional() })
      .parse(req.body);

    if (decision === "reject" && !note?.trim()) {
      throw badRequest("Give a reason when rejecting — the applicant is shown what it says.");
    }

    const { rows: target } = await query(
      `select requested_role, department_id, status from staff_applications where id = $1`,
      [req.params.id]
    );
    if (!target[0]) throw notFound("Application");

    if (!canApprove(req.user.role, target[0].requested_role)) {
      throw badRequest(
        `A ${ROLE_LABEL[req.user.role]} cannot decide a ${ROLE_LABEL[target[0].requested_role]} request.` +
          (req.user.role === "super_admin" ? " Those go to a global super admin." : "")
      );
    }

    try {
      await query(
        decision === "approve"
          ? `select approve_staff_application($1, $2, $3)`
          : `select reject_staff_application($1, $2, $3)`,
        [req.params.id, req.user.id, note ?? null]
      );
    } catch (err) {
      throw badRequest(err.message.replace(/^.*ERROR:\s*/, ""));
    }

    res.json({ ok: true });
  })
);

/* Suspend or reinstate. The database enforces the same chain. */
router.post(
  "/officers/:id/active",
  wrap(async (req, res) => {
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    try {
      await query(`select set_officer_active($1, $2, $3)`, [req.params.id, active, req.user.id]);
    } catch (err) {
      throw badRequest(err.message.replace(/^.*ERROR:\s*/, ""));
    }
    res.json({ ok: true });
  })
);

export default router;
