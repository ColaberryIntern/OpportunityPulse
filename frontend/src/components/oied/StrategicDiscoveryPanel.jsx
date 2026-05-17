// Strategic Intelligence Overlay — discovery panel.
//
// Surfaces the 5 strategic surfaces sourced from the persisted keyword_trends
// snapshot:
//   1. Active commercialization transitions
//   2. Research-to-market crossover
//   3. Strongest cross-channel convergence
//   4. Rising operational pain
//   5. Strongest modernization pressure
//
// Read-only. Recommendation-only — every row is a "consider this as a
// pursuit / Deep Research seed" cue, never an auto-action.

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getStrategicDiscovery } from '../../services/oiedService';

const PRIORITY_BG = {
  critical: { bg: 'bg-red-50',   fg: 'text-red-700' },
  high:     { bg: 'bg-amber-50', fg: 'text-amber-800' },
  standard: { bg: 'bg-gray-50',  fg: 'text-gray-700' },
  low:      { bg: 'bg-gray-50',  fg: 'text-gray-500' },
};

const STAGE_LABEL = {
  unknown: 'unknown',
  research_only: 'research-only',
  early_signal: 'early signal',
  commercializing: 'commercializing',
  production_ready: 'production-ready',
  mainstream: 'mainstream',
};

function PriorityBadge({ priority }) {
  const map = PRIORITY_BG[priority] || PRIORITY_BG.standard;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${map.bg} ${map.fg}`}>
      {priority || 'standard'}
    </span>
  );
}

function ScoreBar({ value, max = 100, color = 'bg-cyan-500' }) {
  const v = Math.max(0, Math.min(max, Number(value) || 0));
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden inline-block w-16 align-middle">
      <div className={`h-full ${color}`} style={{ width: `${(v / max) * 100}%` }} />
    </div>
  );
}

function deepResearchHref(row, origin) {
  if (!row || !row.word) return '#';
  const params = new URLSearchParams({
    seed: row.word, origin,
    mode: 'strategic',
    tags: (row.strategic_tags || []).slice(0, 5).join(','),
    stage: row.commercialization_stage || 'unknown',
    strategic_score: String(row.strategic_score || 0),
  });
  return `/admin/deep-research?${params.toString()}`;
}

function RowList({ rows, origin, scoreField = 'strategic_score', scoreLabel = 'strategic' }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return <div className="text-xs text-gray-400 italic py-1">No signals in this window yet.</div>;
  }
  return (
    <ul className="divide-y divide-gray-100">
      {rows.map((r) => (
        <li key={r.word} className="py-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              to={`/admin/opportunities/my?q=${encodeURIComponent(r.word)}`}
              className="font-mono text-[12px] text-gray-800 hover:underline truncate"
              title={`${r.word} — ${r.match_count || 0} opp matches`}
            >
              {r.display_word || r.word}
            </Link>
            <PriorityBadge priority={r.strategic_priority} />
            <span className="text-[10px] text-gray-500 truncate">
              {STAGE_LABEL[r.commercialization_stage] || r.commercialization_stage}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-gray-600">{scoreLabel} {Math.round(r[scoreField] || 0)}</span>
            <ScoreBar value={r[scoreField] || 0} />
            <Link
              to={deepResearchHref(r, origin)}
              className="text-[10px] px-2 py-0.5 rounded border border-indigo-300 text-indigo-700 hover:bg-indigo-50"
              title="Seed a Deep Research run with this keyword + strategic context"
            >
              Run Deep Research
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, subtitle, count, children, testId }) {
  return (
    <section className="bg-white border border-gray-200 rounded-lg p-4 mb-4" data-testid={testId}>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</h3>
        <span className="text-[10px] text-gray-400">{count != null ? `${count} signal${count === 1 ? '' : 's'}` : ''}</span>
      </div>
      {subtitle && <p className="text-[11px] text-gray-500 mb-2">{subtitle}</p>}
      {children}
    </section>
  );
}

export default function StrategicDiscoveryPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setData(await getStrategicDiscovery({ perSectionLimit: 8 })); }
    catch (e) { setErr(e?.response?.data?.message || e.message || 'Failed to load strategic discovery'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return <div className="p-4 text-center text-gray-500 text-sm" data-testid="strategic-discovery-loading">Loading strategic discovery…</div>;
  }
  if (!data) return null;

  return (
    <div className="mb-8" data-testid="strategic-discovery-panel">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          🧭 Strategic Discovery — emerging venture + procurement signals
        </h2>
        <button
          className="text-[11px] px-2 py-1 border border-gray-200 rounded hover:bg-gray-50"
          onClick={load} disabled={loading}
        >
          Refresh
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Read-only composite over the keyword_trends snapshot. Each section ranks keywords against a
        deterministic strategic axis. <strong>Recommendation-only</strong> — never auto-creates
        pursuits, runs, or proposals.
      </p>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded p-2 mb-3 text-xs">{err}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section
          title="Active commercialization transitions"
          subtitle="Research signal + at least one commercial channel (procurement / hiring / capital)."
          count={data.counts?.active_transitions}
          testId="section-active-transitions"
        >
          <RowList
            rows={data.active_transitions || []}
            origin="strategic_active_transition"
            scoreField="strategic_score"
            scoreLabel="strat"
          />
        </Section>

        <Section
          title="Research → market crossover"
          subtitle="High research velocity AND high procurement signal, not yet mainstream."
          count={data.counts?.research_to_market}
          testId="section-research-to-market"
        >
          <RowList
            rows={data.research_to_market || []}
            origin="strategic_research_to_market"
            scoreField="crossover_score"
            scoreLabel="cross"
          />
        </Section>

        <Section
          title="Strongest cross-channel convergence"
          subtitle="Appears across the most strategic axes (research / procurement / hiring / capital / news)."
          count={data.counts?.strongest_convergence}
          testId="section-convergence"
        >
          <RowList
            rows={data.strongest_convergence || []}
            origin="strategic_convergence"
            scoreField="convergence_score"
            scoreLabel="conv"
          />
        </Section>

        <Section
          title="Rising operational pain"
          subtitle="Pain-vocabulary signals + freshness + hiring/research demand."
          count={data.counts?.rising_operational_pain}
          testId="section-operational-pain"
        >
          <RowList
            rows={data.rising_operational_pain || []}
            origin="strategic_operational_pain"
            scoreField="rising_score"
            scoreLabel="rise"
          />
        </Section>

        <Section
          title="Strongest modernization pressure"
          subtitle="Transformation programs visible in active procurement + infra adjacencies."
          count={data.counts?.strongest_modernization}
          testId="section-modernization"
        >
          <RowList
            rows={data.strongest_modernization || []}
            origin="strategic_modernization"
            scoreField="modernization_score"
            scoreLabel="mod"
          />
        </Section>
      </div>

      <div className="text-[10px] text-gray-400 mt-4 border-t border-gray-100 pt-2">
        Strategic Intelligence Overlay (additive). The legacy "Market Heat" keyword cloud above is
        unchanged. Switch the cloud's <em>Mode</em> selector to align it with these signals.
      </div>
    </div>
  );
}
