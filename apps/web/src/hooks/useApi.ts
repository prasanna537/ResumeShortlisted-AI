"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, errMsg } from "@/lib/api";

/** Fetches `path`; optionally polls every `pollMs`. Redirects to /login on 401. */
export function useApi<T>(path: string | null, opts: { pollMs?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const alive = useRef(true);

  const load = useCallback(
    async (silent = false) => {
      if (!path) return;
      if (!silent) setLoading(true);
      try {
        const d = await api<T>(path);
        if (alive.current) {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 401 && typeof window !== "undefined") window.location.href = "/login";
        if (alive.current) setError(errMsg(e));
      } finally {
        if (alive.current) setLoading(false);
      }
    },
    [path],
  );

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  useEffect(() => {
    if (!opts.pollMs || !path) return;
    const t = setInterval(() => load(true), opts.pollMs);
    return () => clearInterval(t);
  }, [opts.pollMs, path, load]);

  // Stable identity: consumers put `reload` in effect dependency lists, and a new function per render caused request loops.
  const reload = useCallback(() => load(true), [load]);
  return { data, error, loading, reload };
}
