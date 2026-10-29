export const num = (n) => new Intl.NumberFormat("en-IN").format(n ?? 0);

export const when = (iso) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });

export const shortDate = (iso) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

export function ago(iso) {
  const days = Math.floor((Date.now() - new Date(iso)) / 864e5);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return shortDate(iso);
}

/** Deadline state used by both the officer queue and the admin tables. */
export function slaState(deadline, resolvedAt) {
  if (!deadline) return "within";
  if (resolvedAt) return new Date(resolvedAt) <= new Date(deadline) ? "met" : "missed";
  const left = new Date(deadline) - Date.now();
  if (left < 0) return "breached";
  if (left < 6 * 3600 * 1000) return "approaching";
  return "within";
}
