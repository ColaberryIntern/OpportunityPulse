import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  listOpportunities,
  enrichOne,
  enrichAll,
  generateStrategy,
  getOpportunity,
} from '../services/bonfireService';
import BonfireFilters from '../components/bonfire/BonfireFilters';
import BonfireTable from '../components/bonfire/BonfireTable';
import BonfireDetailPanel from '../components/bonfire/BonfireDetailPanel';
import BonfireUploadDropzone from '../components/bonfire/BonfireUploadDropzone';

function BonfirePage() {
  const { user } = useSelector((state) => state.auth);
  const isAdmin = user?.role === 'admin';

  const [filters, setFilters] = useState({});
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState(null);

  const params = useMemo(() => {
    const out = { limit: 50, offset: 0 };
    Object.entries(filters).forEach(([k, v]) => { if (v !== '' && v != null) out[k] = v; });
    return out;
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await listOpportunities(params);
      setRows(res.data || []);
      setTotal(res.pagination?.total ?? (res.data || []).length);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => { load(); }, [load]);

  // --- refresh one row in place after enrich/strategy
  async function refreshSelected(id) {
    try {
      const fresh = await getOpportunity(id);
      setSelected(fresh);
      setRows((prev) => prev.map((r) => (r.id === id ? fresh : r)));
    } catch {
      // ignore; list will re-fetch on next filter change or manual refresh
    }
  }

  async function handleEnrich(row) {
    setBusy(true); setBanner(null);
    try {
      const res = await enrichOne(row.id);
      setBanner(res?.skipped ? 'Already up to date (hash unchanged).' : 'Enrichment complete.');
      await refreshSelected(row.id);
    } catch (e) {
      setBanner('Enrich failed: ' + (e?.response?.data?.message || e.message));
    } finally {
      setBusy(false);
    }
  }

  async function handleStrategy(row) {
    setSelected(row);
    setBusy(true); setBanner(null);
    try {
      await generateStrategy(row.id);
      setBanner('Strategy generated.');
      await refreshSelected(row.id);
    } catch (e) {
      setBanner('Strategy failed: ' + (e?.response?.data?.message || e.message));
    } finally {
      setBusy(false);
    }
  }

  async function handleEnrichAll() {
    if (!isAdmin) return;
    if (!window.confirm('Enrich all unenriched opportunities? This will make OpenAI API calls.')) return;
    setBusy(true); setBanner(null);
    try {
      const res = await enrichAll();
      setBanner(`Bulk enrich: ${res.succeeded}/${res.processed} succeeded, ${res.skipped} skipped, ${res.failed} failed.`);
      await load();
    } catch (e) {
      setBanner('Enrich-all failed: ' + (e?.response?.data?.message || e.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            🔥 Bonfire Opportunity Engine
            <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 font-medium">
              prototype
            </span>
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Sandboxed pipeline for Bonfire procurement opportunities. {total} total.
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={handleEnrichAll}
              className="px-3 py-1.5 rounded bg-accent text-white text-sm hover:bg-accent/90 disabled:opacity-50"
            >
              Enrich All Unenriched
            </button>
          </div>
        )}
      </header>

      {banner && (
        <div className="p-2 rounded bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-sm text-blue-900 dark:text-blue-100">
          {banner}
        </div>
      )}

      {isAdmin && (
        <BonfireUploadDropzone onUploaded={() => load()} />
      )}

      <BonfireFilters value={filters} onChange={setFilters} />

      {err && (
        <div className="p-3 rounded bg-red-50 dark:bg-red-900/30 text-sm text-red-700 dark:text-red-300">
          {err}
        </div>
      )}

      {loading ? (
        <div className="p-6 text-center text-gray-500">Loading…</div>
      ) : (
        <BonfireTable
          rows={rows}
          isAdmin={isAdmin}
          onSelect={setSelected}
          onEnrich={handleEnrich}
          onStrategy={handleStrategy}
        />
      )}

      <BonfireDetailPanel
        row={selected}
        isAdmin={isAdmin}
        busy={busy}
        onClose={() => setSelected(null)}
        onEnrich={handleEnrich}
        onStrategy={handleStrategy}
      />
    </div>
  );
}

export default BonfirePage;
