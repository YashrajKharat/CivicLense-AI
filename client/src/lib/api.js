import { supabase, accessToken } from "./supabase.js";

const BASE = import.meta.env.VITE_API_URL || "";

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/**
 * Fires when a session cannot be recovered. The app listens for this and sends
 * the person to sign in, rather than leaving them clicking buttons that fail
 * silently — which is what a bare 401 looked like from the outside.
 */
export const SESSION_LOST = "civiclense:session-lost";

let refreshing = null;

/**
 * Supabase access tokens are short-lived. The client library refreshes them on
 * its own timer, but a laptop that has been asleep, or a tab left open past the
 * expiry, wakes up holding a dead token — and every request 401s until the page
 * is reloaded.
 *
 * So a 401 is treated as "probably stale" once: refresh, retry, and only then
 * give up. Concurrent 401s share a single refresh, otherwise five parallel
 * requests trigger five refreshes and race each other.
 */
async function refreshOnce() {
  if (!refreshing) {
    refreshing = supabase.auth
      .refreshSession()
      .then(({ data, error }) => (error ? null : data.session?.access_token ?? null))
      .catch(() => null)
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

async function send(path, { body, method = "GET", raw, token }) {
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  if (!raw) headers["Content-Type"] = "application/json";

  const url = `${BASE}/api${path}`;
  try {
    return await fetch(url, {
      method,
      headers,
      body: raw ? body : body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    // If direct connection to BASE failed (e.g. localhost IPv6 resolution), fallback to relative /api via Vite proxy
    if (BASE) {
      return await fetch(`/api${path}`, {
        method,
        headers,
        body: raw ? body : body ? JSON.stringify(body) : undefined,
      });
    }
    throw err;
  }
}

async function request(path, options = {}) {
  let token = await accessToken();
  let res;

  try {
    res = await send(path, { ...options, token });
  } catch {
    // fetch itself failed — the server is down, or there is no network.
    throw new ApiError(
      "Could not reach the server. Check that it is running on port 4000.",
      0
    );
  }

  if (res.status === 401 && token) {
    const fresh = await refreshOnce();

    if (fresh) {
      res = await send(path, { ...options, token: fresh });
    }

    if (!fresh || res.status === 401) {
      window.dispatchEvent(new CustomEvent(SESSION_LOST));
      throw new ApiError("Your session has expired. Sign in again.", 401);
    }
  }

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      payload.error || "The request did not complete.",
      res.status,
      payload.details
    );
  }

  return payload;
}

const form = (path, file, fields = {}) => {
  const data = new FormData();
  data.append("photo", file);
  Object.entries(fields).forEach(([k, v]) => v != null && data.append(k, v));
  return request(path, { method: "POST", body: data, raw: true });
};

export const api = {
  /* profile */
  me: () => request("/me"),
  updateMe: (patch) => request("/me", { method: "PATCH", body: patch }),
  uploadAvatar: (file) => form("/me/avatar", file),
  changePassword: (password) => request("/me/password", { method: "POST", body: { password } }),
  signOutEverywhere: () => request("/me/signout-all", { method: "POST" }),
  deleteAccount: () => request("/me", { method: "DELETE", body: { confirm: "DELETE" } }),
  citizenDashboard: () => request("/me/dashboard"),

  /* geography and follow-ups */
  // No session needed — the landing page is what somebody sees before they
  // have one.
  publicStats: () => request("/geo/public-stats"),

  /* the public record — no session needed */
  publicReports: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/public/reports${qs ? `?${qs}` : ""}`);
  },
  publicReport: (ref) => request(`/public/reports/${ref}`),
  leaderboard: () => request("/public/leaderboard"),
  addComment: (ref, kind, body) =>
    request(`/public/reports/${ref}/comments`, { method: "POST", body: { kind, body } }),
  hideComment: (id, reason) =>
    request(`/public/comments/${id}/hide`, { method: "POST", body: { reason } }),
  address: (lat, lng) => request(`/geo/address?lat=${lat}&lng=${lng}`),
  duplicates: (lat, lng, category, radius = 250) =>
    request(`/geo/duplicates?lat=${lat}&lng=${lng}&category=${category ?? ""}&radius=${radius}`),
  searchAddress: (q, near) =>
    request(`/geo/search?q=${encodeURIComponent(q)}${near ? `&lat=${near.lat}&lng=${near.lng}` : ""}`),
  nearby: (lat, lng, radius = 2000) => request(`/geo/nearby?lat=${lat}&lng=${lng}&radius=${radius}`),
  resolveResponsibility: (lat, lng, categoryId) =>
    request(`/geo/responsibility?lat=${lat}&lng=${lng}&category=${categoryId ?? ""}`),
  followupQuestions: (category, lang = "en") =>
    request(`/followups?category=${category ?? ""}&lang=${lang}`),
  answerFollowups: (ref, answers) => request(`/followups/${ref}`, { method: "POST", body: { answers } }),

  /* citizen */
  analyseImage: (file, coords) => form("/complaints/analyse", file, { lat: coords?.lat, lng: coords?.lng }),
  createComplaint: (payload) => request("/complaints", { method: "POST", body: payload }),
  myComplaints: () => request("/complaints/mine"),
  withdrawComplaint: (ref) => request(`/complaints/${ref}`, { method: "DELETE" }),
  confirmResolution: (ref, resolved, comment) =>
    request(`/complaints/${ref}/feedback`, { method: "POST", body: { resolved, comment } }),
  reviewComplaint: (ref, review) => request(`/complaints/${ref}/review`, { method: "POST", body: review }),

  /* officer */
  officerQueue: () => request("/officer/queue"),
  officerJob: (ref) => request(`/officer/jobs/${ref}`),
  officerStatus: (ref, status, note) =>
    request(`/officer/jobs/${ref}/status`, { method: "POST", body: { status, note } }),
  officerProof: (ref, file, notes) => form(`/officer/jobs/${ref}/proof`, file, { notes }),
  officerPerformance: () => request("/officer/performance"),

  /* administration */
  overview: () => request("/admin/overview"),
  adminComplaints: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== "" && v != null)
    ).toString();
    return request(`/admin/complaints${qs ? `?${qs}` : ""}`);
  },
  // Scoped to the complaint's department, not the caller's — a water leak
  // should only ever offer water officers.
  assignableOfficers: (ref) =>
    request(`/admin/assignable${ref ? `?complaint=${ref}` : ""}`),
  complaint: (ref) => request(`/complaints/${ref}`),
  assignOfficer: (ref, officerId) =>
    request(`/complaints/${ref}/assign`, { method: "POST", body: { officerId } }),
  autoAssignOfficer: (ref) =>
    request(`/complaints/${ref}/auto-assign`, { method: "POST" }),
  autoAssignAll: (params = {}) =>
    request("/admin/auto-assign-all", { method: "POST", body: params }),
  aiRecommendOfficer: (ref) =>
    request(`/officers/ai-recommendation?complaint=${ref}`),
  clusters: () => request("/clusters"),
  zones: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/zones${qs ? `?${qs}` : ""}`);
  },
  rebuildZones: (radius) => request("/zones/rebuild", { method: "POST", body: { radius } }),
  assignZone: (ref, officerId) =>
    request(`/zones/${ref}/assign`, { method: "POST", body: { officerId } }),
  rejectComplaint: (ref, reason) =>
    request(`/complaints/${ref}/reject`, { method: "POST", body: { reason } }),
  cluster: (ref) => request(`/clusters/${ref}`),
  clusterBrief: (ref) => request(`/clusters/${ref}/brief`, { method: "POST" }),
  departments: () => request("/departments"),
  department: (id) => request(`/departments/${id}`),
  officers: () => request("/officers"),
  officer: (id) => request(`/officers/${id}`),
  suggestOfficer: (ref) => request(`/officers/suggest?complaint=${ref}`),
  contracts: () => request("/contracts"),
  analytics: (days = 30) => request(`/metrics?days=${days}`),
  insights: () => request("/insights"),
  refreshInsights: () => request("/insights/refresh", { method: "POST" }),
  reviewQueue: () => request("/review"),
  reviewDecision: (ref, decision, note) =>
    request(`/review/${ref}`, { method: "POST", body: { decision, note } }),
  generateReport: (payload) => request("/reports", { method: "POST", body: payload }),
  reports: () => request("/reports"),
  reportSections: () => request("/reports/sections"),
  report: (id) => request(`/reports/${id}`),
  auditLog: () => request("/audit"),
  ask: (question) => request("/assistant", { method: "POST", body: { question } }),

  /* categories */
  categories: (all = false) => request(`/categories${all ? "?all=true" : ""}`),
  createCategory: (payload) => request("/categories", { method: "POST", body: payload }),
  updateCategory: (id, payload) => request(`/categories/${id}`, { method: "PATCH", body: payload }),
  setCategoryActive: (id, active) =>
    request(`/categories/${id}/active`, { method: "POST", body: { active } }),

  /* staff onboarding */
  registerStaff: (payload) => request("/staff/register", { method: "POST", body: payload }),
  applyForStaff: (payload) => request("/staff/apply", { method: "POST", body: payload }),
  staffDepartments: () => request("/staff/departments"),
  myApplication: () => request("/staff/my-application"),
  staffApplications: (status = "pending") => request(`/staff/applications?status=${status}`),
  decideApplication: (id, decision, note) =>
    request(`/staff/applications/${id}/decide`, { method: "POST", body: { decision, note } }),
  setOfficerActive: (id, active) =>
    request(`/staff/officers/${id}/active`, { method: "POST", body: { active } }),

  /* agent */
  agentTools: () => request("/agent/tools"),
  agentRuns: () => request("/agent/runs"),
  agentRun: (id) => request(`/agent/runs/${id}`),
  agentProposals: () => request("/agent/proposals"),
  decideProposal: (id, decision, note) =>
    request(`/agent/proposals/${id}`, { method: "POST", body: { decision, note } }),

  /* notifications */
  notifications: () => request("/notifications"),
  markNotificationsRead: () => request("/notifications/read", { method: "POST" }),
};
