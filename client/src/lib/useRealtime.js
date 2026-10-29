import { useEffect } from "react";
import { supabase } from "./supabase.js";

/**
 * Subscribes to Postgres changes through Supabase. RLS applies to the realtime
 * stream too, so a subscriber only receives rows they were already allowed to
 * read — the channel is not a way around the policies.
 */
export function useRealtime(table, { filter, event = "*", onChange } = {}) {
  useEffect(() => {
    if (!onChange) return;

    const channel = supabase
      .channel(`cp:${table}:${filter || "all"}`)
      .on("postgres_changes", { schema: "public", table, event, ...(filter ? { filter } : {}) }, onChange)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [table, filter, event, onChange]);
}

/** Polling fallback for anything not worth a realtime channel. */
export function usePoll(fn, intervalMs = 30_000, deps = []) {
  useEffect(() => {
    fn();
    const id = setInterval(fn, intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
