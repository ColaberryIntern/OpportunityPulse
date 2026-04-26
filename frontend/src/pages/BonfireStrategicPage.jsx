import React, { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  listStrategic,
  getStrategic,
  runStrategist,
  patchStrategic,
} from '../services/bonfireService';

// USD whole-dollar formatter for the money pillar (numbers come from the AI as
// integers, not cents).
function fmtUSD(n) {
  if (n == null || n === 0) return '—';
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return '$' + Math.round(n / 1_000) + 'k';
  return '$' + n;
}

function StatusPill({ status }) {
  const colors = {
    new: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    reviewed: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    pursuing: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    dismissed: 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colors[status] || colors.new}`}>
      {status}
    </span>
  );
}

function StrategicCard({ row, onClick }) {
  const m = row.money || {};
  const r = row.roi || {};
  const a = row.aiSystem || {};
  const isCluster = row.patternType === 'cluster';
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-blue-400 hover:shadow-md transition"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
              isCluster
                ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
            }`}>
              {isCluster ? `📦 cluster (${(row.sourceOpportunityIds || []).length} bids)` : '🎯 standalone'}
            </span>
            <StatusPill status={row.status} />
            {row.strategicScore != null && (
              <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 font-semibold">
                score {row.strategicScore}
              </span>
            )}
          </div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 leading-snug">{row.title}</h3>
        </div>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-3">{row.summary}</p>
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">Initial bid</div>
          <div className="font-semibold text-gray-900 dark:text-gray-100">{fmtUSD(m.initial_bid_value_usd)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">Market</div>
          <div className="font-semibold text-gray-900 dark:text-gray-100">{fmtUSD(m.addressable_market_usd)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">Payback</div>
          <div className="font-semibold text-gray-900 dark:text-gray-100">
            {r.payback_months ? `${r.payback_months}mo` : '—'}
          </div>
        </div>
      </div>
      {a.what_to_build && (
        <div className="mt-3 text-xs text-gray-700 dark:text-gray-300">
          <span className="text-gray-500">AI system:</span> {String(a.what_to_build).slice(0, 140)}
          {String(a.what_to_build).length > 140 ? '…' : ''}
        </div>
      )}
    </button>
  );
}

function PillarBlock({ title, children, color = 'blue' }) {
  const colorMap = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-900/40 text-blue-800 dark:text-blue-200',
    green: 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-900/40 text-green-800 dark:text-green-200',
    purple: 'bg-purple-50 dark:bg-purple-900/20 border-purple-100 dark:border-purple-900/40 text-purple-800 dark:text-purple-200',
    amber: 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-900/40 text-amber-800 dark:text-amber-200',
  };
  return (
    <div className={`rounded-lg border p-4 ${colorMap[color]}`}>
      <div className="text-xs uppercase tracking-wide font-semibold mb-2">{title}</div>
      <div className="text-sm text-gray-900 dark:text-gray-100 space-y-1.5">
        {children}
      </div>
    </div>
  );
}

function KV({ label, value }) {
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) return null;
  return (
    <div>
      <span className="text-xs text-gray-500 mr-2">{label}:</span>
      <span className="text-sm">
        {Array.isArray(value) ? value.join(', ') : String(value)}
      </span>
    </div>
  );
}

function StrategicDetail({ row, isAdmin, onClose, onPatch }) {
  if (!row) return null;
  const m = row.money || {};
  const r = row.roi || {};
  const a = row.aiSystem || {};
  const b = row.businessViability || {};
  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <div className="flex-1 bg-black/40" onClick={onClose} aria-hidden="true" />
      <aside className="w-full max-w-2xl h-full overflow-y-auto bg-white dark:bg-gray-900 shadow-xl border-l border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <StatusPill status={row.status} />
              <span className="text-xs text-gray-500">{row.patternType} · {row.generatedForDate}</span>
              {row.strategicScore != null && (
                <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 font-semibold">
                  score {row.strategicScore}
                </span>
              )}
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{row.title}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line mb-4 leading-relaxed">
          {row.summary}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <PillarBlock title="💰 Money" color="green">
            <KV label="Initial bid" value={fmtUSD(m.initial_bid_value_usd)} />
            <KV label="Cluster total" value={fmtUSD(m.cluster_total_usd)} />
            <KV label="Addressable market" value={fmtUSD(m.addressable_market_usd)} />
            <KV label="Confidence" value={m.confidence} />
          </PillarBlock>
          <PillarBlock title="📈 ROI" color="blue">
            <KV label="Investment" value={fmtUSD(r.investment_usd)} />
            <KV label="Payback" value={r.payback_months ? `${r.payback_months} months` : null} />
            <KV label="Margin" value={r.margin_pct ? `${r.margin_pct}%` : null} />
            <KV label="Confidence" value={r.confidence} />
          </PillarBlock>
          <PillarBlock title="🤖 AI System" color="purple">
            <KV label="What to build" value={a.what_to_build} />
            <KV label="Capabilities" value={a.capabilities} />
            <KV label="Operator role" value={a.operator_role} />
            <KV label="Build effort" value={a.build_effort_weeks ? `${a.build_effort_weeks} weeks` : null} />
          </PillarBlock>
          <PillarBlock title="🏛️ Business Viability" color="amber">
            <KV label="Primary buyer" value={b.primary_buyer} />
            <KV label="Secondary markets" value={b.secondary_markets} />
            <KV label="Pricing" value={b.pricing_model} />
            <KV label="GTM" value={b.gtm_strategy} />
            <KV label="Moat" value={b.moat} />
          </PillarBlock>
        </div>

        {(row.sourceOpportunityIds || []).length > 0 && (
          <div className="mb-4 text-xs text-gray-600 dark:text-gray-400">
            <span className="text-gray-500 uppercase tracking-wide font-semibold">Source bids:</span>{' '}
            {row.sourceOpportunityIds.length} bonfire opportunity ID(s) inspired this strategy.
          </div>
        )}

        {isAdmin && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            {['new', 'reviewed', 'pursuing', 'dismissed'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onPatch && onPatch(row.id, { status: s })}
                className={`px-3 py-1 text-xs rounded font-medium ${
                  row.status === s
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

function BonfireStrategicPage() {
  const { user } = useSelector((s) => s.auth);
  const isAdmin = user?.role === 'admin';

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [banner, setBanner] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const params = { limit: 100, offset: 0 };
      if (statusFilter) params.status = statusFilter;
      const res = await listStrategic(params);
      setRows(res.data || []);
      setTotal(res.pagination?.total ?? (res.data || []).length);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function handleOpen(row) {
    try {
      const fresh = await getStrategic(row.id);
      setSelected(fresh || row);
    } catch {
      setSelected(row);
    }
  }

  async function handleRun() {
    if (!isAdmin) return;
    if (!window.confirm(
      'Run the Strategist now? This will read recent Bonfire opps, cluster them,\nand make ~10-20 OpenAI calls (~$1 cost). Today\'s existing batch will be kept.'
    )) return;
    setBusy(true); setBanner(null);
    try {
      await runStrategist({ force: false });
      setBanner('Strategist run kicked off. Refresh in ~2 minutes.');
    } catch (e) {
      setBanner('Run failed: ' + (e?.response?.data?.message || e.message));
    } finally {
      setBusy(false);
    }
  }

  async function handlePatch(id, body) {
    try {
      const updated = await patchStrategic(id, body);
      setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
      if (selected && selected.id === id) setSelected(updated);
    } catch (e) {
      setBanner('Update failed: ' + (e?.response?.data?.message || e.message));
    }
  }

  return (
    <div className="p-4 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            🎯 Strategic Opportunities
            <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 font-medium">
              curated
            </span>
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            AI-curated opportunities synthesized from the Bonfire pipeline. Each one
            has a money plan, ROI estimate, AI-system spec, and a viable downstream business.
            {' '}
            <span className="text-gray-400">{total} total.</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 dark:bg-gray-800 rounded px-2 py-1.5 text-sm"
          >
            <option value="">All statuses</option>
            <option value="new">New</option>
            <option value="reviewed">Reviewed</option>
            <option value="pursuing">Pursuing</option>
            <option value="dismissed">Dismissed</option>
          </select>
          {isAdmin && (
            <button
              type="button"
              disabled={busy}
              onClick={handleRun}
              className="px-3 py-1.5 rounded bg-accent text-white text-sm hover:bg-accent/90 disabled:opacity-50"
            >
              Run Strategist
            </button>
          )}
        </div>
      </header>

      {banner && (
        <div className="p-2 rounded bg-blue-50 dark:bg-blue-900/30 border border-blue-200 text-sm text-blue-900 dark:text-blue-100">
          {banner}
        </div>
      )}
      {err && (
        <div className="p-3 rounded bg-red-50 dark:bg-red-900/30 text-sm text-red-700 dark:text-red-300">
          {err}
        </div>
      )}

      {loading ? (
        <div className="p-6 text-center text-gray-500">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md">
          No strategic opportunities yet.
          {isAdmin && ' Click "Run Strategist" to generate today\'s batch.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map((r) => (
            <StrategicCard key={r.id} row={r} onClick={() => handleOpen(r)} />
          ))}
        </div>
      )}

      <StrategicDetail
        row={selected}
        isAdmin={isAdmin}
        onClose={() => setSelected(null)}
        onPatch={handlePatch}
      />
    </div>
  );
}

export default BonfireStrategicPage;
