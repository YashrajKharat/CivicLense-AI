import { createClient } from "@supabase/supabase-js";
import { query } from "../db/pool.js";
import { HttpError, wrap } from "./errors.js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * The role hierarchy.
 *
 *   global_admin   city-wide. Appoints super admins. Seeded by hand.
 *        ↓ approves
 *   super_admin    one department. Appoints officers in that department.
 *        ↓ approves
 *   officer        field staff. Works assigned complaints.
 *
 *   citizen        reports issues. Never approved by anyone.
 *
 * Each tier appoints only the tier directly beneath it. A super admin cannot
 * create another super admin, and nobody can create a global admin through the
 * application — that one is a deliberate database action.
 */
export const ROLE_RANK = {
  citizen: 0,
  officer: 1,
  super_admin: 2,
  global_admin: 3,
};

export const ROLE_LABEL = {
  citizen: "resident",
  officer: "officer",
  super_admin: "department super admin",
  global_admin: "global super admin",
};

/** Who each role is allowed to approve. */
export const APPROVES = {
  global_admin: ["super_admin"],
  super_admin: ["officer"],
  officer: [],
  citizen: [],
};

export const canApprove = (actorRole, targetRole) =>
  (APPROVES[actorRole] || []).includes(targetRole);

export const rank = (role) => ROLE_RANK[role] ?? -1;

/**
 * Verifies the Supabase token, then reads the profile straight from Postgres.
 *
 * This used to go through PostgREST with an embedded `officers(department_id)`
 * join. When a user had no officers row the embed failed, the error was
 * discarded, and the role silently fell back to "citizen" — so a real global
 * admin got 403s with nothing in the logs to explain why. A plain LEFT JOIN has
 * no such failure mode, and a genuinely missing profile is now an explicit
 * error rather than a quiet demotion.
 */
export const requireAuth = wrap(async (req, _res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) throw new HttpError(401, "Sign in to continue.");

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, "Your session has expired.");

  const { rows } = await query(
    `select p.id, p.role, p.full_name,
            o.department_id, o.active as officer_active, o.approved_at,
            d.name as department_name
     from profiles p
     left join officers o on o.id = p.id
     left join departments d on d.id = o.department_id
     where p.id = $1`,
    [data.user.id]
  );

  if (!rows[0]) {
    // The trigger on auth.users normally creates this. If it is missing the
    // account is genuinely broken, and pretending they are a citizen would hide
    // that until something failed further downstream.
    throw new HttpError(403, "Your profile has not been set up. Contact an administrator.");
  }

  const row = rows[0];

  req.user = {
    id: row.id,
    email: data.user.email,
    name: row.full_name,
    role: row.role,
    rank: rank(row.role),
    departmentId: row.department_id ?? null,
    departmentName: row.department_name ?? null,
    officerActive: row.officer_active ?? null,
    approvedAt: row.approved_at ?? null,
    approves: APPROVES[row.role] || [],
  };

  next();
});

/** Exact-role gate. Use when a route belongs to specific tiers, not a floor. */
export const requireRole = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user?.role)) {
    return next(
      new HttpError(
        403,
        `This needs ${roles.map((r) => ROLE_LABEL[r] || r).join(" or ")} access. ` +
          `You are signed in as a ${ROLE_LABEL[req.user?.role] || "user with no role"}.`
      )
    );
  }
  next();
};

/**
 * Floor gate — this tier and everything above it. Preferred for most admin
 * routes, so adding a tier later does not mean editing every route list.
 */
export const requireMinRole = (minimum) => (req, _res, next) => {
  if (rank(req.user?.role) < rank(minimum)) {
    return next(
      new HttpError(
        403,
        `This needs at least ${ROLE_LABEL[minimum]} access. ` +
          `You are signed in as a ${ROLE_LABEL[req.user?.role] || "user with no role"}.`
      )
    );
  }
  next();
};

/**
 * Blocks a staff account that exists but has not been authorised, and one that
 * has been suspended. Having the role is not the same as being allowed to act.
 */
export const requireApprovedStaff = (req, _res, next) => {
  if (req.user.rank < ROLE_RANK.officer) {
    return next(new HttpError(403, "This area is for approved staff."));
  }
  if (req.user.role === "global_admin") return next(); // seeded, never approved

  if (!req.user.approvedAt) {
    return next(new HttpError(403, "Your account is still awaiting approval."));
  }
  if (req.user.officerActive === false) {
    return next(new HttpError(403, "Your account is suspended. Contact your department."));
  }
  next();
};

/**
 * Enforces who may approve whom, and that a super admin only ever appoints
 * within their own department. Attach after loading the application row onto
 * `req.application`.
 */
export const requireApprovalRights = (req, _res, next) => {
  const application = req.application;
  if (!application) return next(new HttpError(500, "No application loaded."));

  if (!canApprove(req.user.role, application.requested_role)) {
    return next(
      new HttpError(
        403,
        `A ${ROLE_LABEL[req.user.role]} cannot approve a ${ROLE_LABEL[application.requested_role]}. ` +
          (req.user.role === "super_admin"
            ? "Super admin requests are decided by a global super admin."
            : "")
      )
    );
  }

  if (
    req.user.role === "super_admin" &&
    application.department_id !== req.user.departmentId
  ) {
    return next(new HttpError(403, "You can only approve officers in your own department."));
  }

  next();
};

/** Convenience gates used across the routes. */
export const requireOfficer = [requireAuth, requireMinRole("officer"), requireApprovedStaff];
export const requireAdmin = [requireAuth, requireMinRole("super_admin"), requireApprovedStaff];
export const requireGlobalAdmin = [requireAuth, requireRole("global_admin")];
