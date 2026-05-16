import { useEffect, useState, useCallback, useRef } from 'react';
import { describeMyPermissions } from '../services/deepResearchService';

// Phase 12 — frontend RBAC sync hook.
//
// Loads the current user's effective Phase 11 RBAC permission set once per
// session and caches it in-memory. Returns:
//   { role, role_level, permissions, loading, error, can(name), reload() }
//
// IMPORTANT: this is UX-only sync. Backend remains the source of truth on
// every API call. A user with a stale cache who hits a permission-gated
// route still gets a 403 from the backend.

let cached = null;
let cachedAt = 0;
const TTL_MS = 5 * 60 * 1000;

export function usePermissions({ force = false } = {}) {
  const [data, setData] = useState(() => (
    cached && (Date.now() - cachedAt) < TTL_MS ? cached : null
  ));
  const [loading, setLoading] = useState(!data && !cached);
  const [error, setError] = useState(null);
  const inflightRef = useRef(null);

  const load = useCallback(async (refresh = false) => {
    if (!refresh && cached && (Date.now() - cachedAt) < TTL_MS) {
      setData(cached); setLoading(false); return cached;
    }
    if (inflightRef.current) return inflightRef.current;
    setLoading(true); setError(null);
    const p = describeMyPermissions()
      .then((res) => {
        cached = res || { role: 'observer', role_level: 0, permissions: [] };
        cachedAt = Date.now();
        setData(cached);
        return cached;
      })
      .catch((e) => {
        setError(e?.response?.data?.message || e.message || 'Permission lookup failed');
        // Fail-closed for UX safety: observer-only when we can't fetch.
        cached = { role: 'observer', role_level: 0, permissions: ['dashboard.view'] };
        cachedAt = Date.now();
        setData(cached);
        return cached;
      })
      .finally(() => { setLoading(false); inflightRef.current = null; });
    inflightRef.current = p;
    return p;
  }, []);

  useEffect(() => { load(force); }, [load, force]);

  const can = useCallback((perm) => {
    if (!data || !Array.isArray(data.permissions)) return false;
    return data.permissions.includes(perm);
  }, [data]);

  return {
    role: data ? data.role : null,
    role_level: data ? data.role_level : 0,
    permissions: data ? data.permissions : [],
    loading, error, can,
    reload: () => load(true),
  };
}

// Imperative escape hatch — for cases where a component can't use a hook
// (older class components, callbacks outside render).
export function getCachedPermissions() {
  return cached;
}

export function _resetPermissionCache() {
  cached = null;
  cachedAt = 0;
}
