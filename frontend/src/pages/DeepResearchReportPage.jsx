import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getDeepResearchReport, getDeepResearchStatus } from '../services/deepResearchService';
import RequirementsProgressModal from '../components/deepResearch/RequirementsProgressModal';

// Deep Research Intelligence Engine — the report page.
//
// An executive intelligence dashboard for one synthesized deep research
// report. Light theme, editorial readability. While a report is still
// 'running' it polls status, then loads the full report once synthesis
// completes.

const STAGE_META = {
  too_early: { label: 'Too Early', cls: 'bg-gray-100 text-gray-700' },
  emerging: { label: 'Emerging', cls: 'bg-blue-100 text-blue-700' },
  active: { label: 'Active Market', cls: 'bg-green-100 text-green-700' },
  saturated: { label: 'Saturated', cls: 'bg-amber-100 text-amber-700' },
  unknown: { label: 'Unknown', cls: 'bg-gray-100 text-gray-500' },
};

const REVENUE_META = {
  low: { label: 'Low', cls: 'bg-gray-100 text-gray-600' },
  medium: { label: 'Medium', cls: 'bg-blue-100 text-blue-700' },
  high: { label: 'High', cls: 'bg-green-100 text-green-700' },
  very_high: { label: 'Very High', cls: 'bg-emerald-100 text-emerald-800' },
};

const POLL_MS = 2000;

function Section({ title, children, testId }) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-6 mb-5" data-testid={testId}>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">{title}</h2>
      {children}
    </section>
  );
}

function VentureIdeaCard({ idea, onGenerate }) {
  const revenue = REVENUE_META[idea.revenuePotential] || REVENUE_META.medium;
  const timing = STAGE_META[idea.marketTiming] || null;
  const build = idea.buildabilityScore != null ? Math.round(Number(idea.buildabilityScore) * 100) : null;
  const arch = idea.metadata && idea.metadata.suggested_architecture;
  const customers = idea.metadata && idea.metadata.target_customers;
  const latestJob = (idea.generationJobs || []).slice().sort((a, b) => b.id - a.id)[0];
  return (
    <div className="border border-gray-200 rounded-lg p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">{idea.title}</h3>
        <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded ${revenue.cls}`}>
          {revenue.label} revenue
        </span>
      </div>
      {idea.description && <p className="text-sm text-gray-600 mt-2">{idea.description}</p>}

      <div className="flex flex-wrap gap-2 mt-3">
        {timing && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${timing.cls}`}>{timing.label}</span>
        )}
        {build != null && (
          <span className="text-xs font-medium px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">
            {build}% buildable
          </span>
        )}
      </div>

      <dl className="mt-3 space-y-2 text-sm">
        {idea.mvpScope && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-400">MVP Scope</dt>
            <dd className="text-gray-700">{idea.mvpScope}</dd>
          </div>
        )}
        {idea.monetizationStrategy && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-400">Monetization</dt>
            <dd className="text-gray-700">{idea.monetizationStrategy}</dd>
          </div>
        )}
        {idea.gtmSummary && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-400">Go-to-Market</dt>
            <dd className="text-gray-700">{idea.gtmSummary}</dd>
          </div>
        )}
        {arch && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-400">Suggested Architecture</dt>
            <dd className="text-gray-700">{arch}</dd>
          </div>
        )}
        {customers && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-400">Target Customers</dt>
            <dd className="text-gray-700">{customers}</dd>
          </div>
        )}
      </dl>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => onGenerate(idea)}
          className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
          data-testid={`generate-requirements-${idea.id}`}
        >
          Generate Requirements
        </button>
        {latestJob && (
          <span className="text-xs text-gray-500">
            Last job: {latestJob.status}
            {latestJob.status === 'running' ? ` (${latestJob.progressPercent}%)` : ''}
          </span>
        )}
      </div>
    </div>
  );
}

function DeepResearchReportPage() {
  const { id } = useParams();
  const [report, setReport] = useState(null);
  const [status, setStatus] = useState(null);
  const [err, setErr] = useState(null);
  const [activeIdea, setActiveIdea] = useState(null);
  const timerRef = useRef(null);

  const loadFull = useCallback(async () => {
    try {
      const r = await getDeepResearchReport(id);
      setReport(r);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed to load report');
    }
  }, [id]);

  const pollStatus = useCallback(async () => {
    try {
      const s = await getDeepResearchStatus(id);
      setStatus(s);
      if (s.status !== 'running') {
        if (timerRef.current) clearInterval(timerRef.current);
        loadFull();
      }
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed to load report status');
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [id, loadFull]);

  useEffect(() => {
    // First fetch the full report. If it's still running, fall back to polling.
    (async () => {
      try {
        const r = await getDeepResearchReport(id);
        setReport(r);
        if (r.status === 'running') {
          timerRef.current = setInterval(pollStatus, POLL_MS);
        }
      } catch (e) {
        setErr(e?.response?.data?.message || e.message || 'Failed to load report');
      }
    })();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [id, pollStatus]);

  if (err) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Link to="/admin/opportunities/my" className="text-sm text-blue-600">← My Opportunities</Link>
        <div className="mt-4 text-red-600 bg-red-50 border border-red-200 rounded p-4">{err}</div>
      </div>
    );
  }

  if (!report) {
    return <div className="p-6 text-center text-gray-500">Loading deep research report…</div>;
  }

  if (report.status === 'running') {
    return (
      <div className="p-6 max-w-3xl mx-auto text-center">
        <div className="text-4xl mb-3">🧠</div>
        <h1 className="text-xl font-semibold text-gray-900">Synthesizing venture intelligence…</h1>
        <p className="text-sm text-gray-500 mt-2">
          Search: <strong>{report.searchTerm}</strong>
          {status && status.source_count ? ` · ${status.source_count} sources` : ''}
        </p>
        <div className="mt-4 inline-block w-48 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-600 animate-pulse" style={{ width: '60%' }} />
        </div>
      </div>
    );
  }

  const rj = report.reportJson || {};
  const stage = STAGE_META[report.marketStage] || STAGE_META.unknown;
  const confidence = report.confidenceScore != null ? Math.round(Number(report.confidenceScore) * 100) : null;
  const ideas = report.ventureIdeas || [];

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-5">
          <Link to="/admin/opportunities/my" className="text-sm text-blue-600">← My Opportunities</Link>
          <div className="flex items-start justify-between gap-4 mt-2">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Deep Research: {report.searchTerm}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {report.origin === 'daily_scan' ? 'Automated daily scan' : 'Manual research'}
                {' · '}{report.sourceCount} sources synthesized
                {' · '}{new Date(report.createdAt).toLocaleString()}
                {report.status === 'partial' && (
                  <span className="ml-2 text-amber-600">· partial (venture ideas unavailable)</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded ${stage.cls}`}>{stage.label}</span>
              {confidence != null && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded bg-gray-100 text-gray-600">
                  {confidence}% confidence
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Executive Summary */}
        <Section title="Executive Summary" testId="section-executive-summary">
          <p className="text-gray-800 leading-relaxed">
            {report.executiveSummary || 'No executive summary available.'}
          </p>
        </Section>

        {/* Market Timing */}
        <Section title="Market Timing" testId="section-market-timing">
          <div className="flex items-center gap-3 mb-2">
            <span className={`text-sm font-semibold px-2.5 py-1 rounded ${stage.cls}`}>{stage.label}</span>
          </div>
          <p className="text-gray-700">{rj.market_timing_narrative || '—'}</p>
          {rj.trend_summary && (
            <p className="text-sm text-gray-500 mt-2">Trend: {rj.trend_summary}</p>
          )}
        </Section>

        {/* Opportunity Signals */}
        <Section title="Opportunity Signals" testId="section-opportunity-signals">
          {(rj.opportunity_signals || []).length > 0 ? (
            <ul className="list-disc pl-5 space-y-1.5 text-gray-700">
              {rj.opportunity_signals.map((s) => <li key={s}>{s}</li>)}
            </ul>
          ) : <p className="text-gray-400">No signals identified.</p>}
          {(rj.channel_breakdown || []).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-gray-100">
              {rj.channel_breakdown.map((c) => (
                <span key={c.key} className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                  {c.label}: {c.count}
                </span>
              ))}
            </div>
          )}
        </Section>

        {/* Venture Ideas */}
        <Section title={`Venture Ideas (${ideas.length})`} testId="section-venture-ideas">
          {ideas.length > 0 ? (
            <div className="space-y-4">
              {ideas.map((idea) => (
                <VentureIdeaCard key={idea.id} idea={idea} onGenerate={setActiveIdea} />
              ))}
            </div>
          ) : (
            <p className="text-gray-400">
              No venture ideas were generated
              {report.status === 'partial' ? ' — synthesis was degraded.' : '.'}
            </p>
          )}
        </Section>

        {/* Revenue Potential */}
        <Section title="Revenue Potential" testId="section-revenue-potential">
          {ideas.length > 0 ? (
            <ul className="space-y-1.5">
              {ideas.map((idea) => {
                const rev = REVENUE_META[idea.revenuePotential] || REVENUE_META.medium;
                return (
                  <li key={idea.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{idea.title}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${rev.cls}`}>{rev.label}</span>
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-gray-400">No revenue analysis available.</p>}
        </Section>

        {/* Government Alignment */}
        <Section title="Government Alignment" testId="section-government-alignment">
          <p className="text-gray-700">{rj.government_alignment || 'No government / public-sector angle identified.'}</p>
        </Section>

        {/* Research Highlights */}
        <Section title="Research Highlights" testId="section-research-highlights">
          {(rj.research_highlights || []).length > 0 ? (
            <ul className="list-disc pl-5 space-y-1.5 text-gray-700">
              {rj.research_highlights.map((s) => <li key={s}>{s}</li>)}
            </ul>
          ) : <p className="text-gray-400">No research papers in this synthesis.</p>}
        </Section>

        {/* Suggested MVPs */}
        <Section title="Suggested MVPs" testId="section-suggested-mvps">
          {(rj.suggested_mvps || []).length > 0 ? (
            <ul className="list-disc pl-5 space-y-1.5 text-gray-700">
              {rj.suggested_mvps.map((s) => <li key={s}>{s}</li>)}
            </ul>
          ) : <p className="text-gray-400">No MVP directions identified.</p>}
        </Section>

        {/* Monetization Strategy */}
        <Section title="Monetization Strategy" testId="section-monetization-strategy">
          <p className="text-gray-700">{rj.monetization_strategy || '—'}</p>
        </Section>

        {/* Build Recommendation */}
        <Section title="Build Recommendation" testId="section-build-recommendation">
          <p className="text-gray-800 font-medium">{rj.build_recommendation || '—'}</p>
        </Section>

        <p className="text-xs text-gray-400 text-center mt-2 mb-8">
          Generated by the Deep Research Intelligence Engine · Phase 1 ·
          {rj.generated_at ? ` ${new Date(rj.generated_at).toLocaleString()}` : ''}
        </p>
      </div>

      {activeIdea && (
        <RequirementsProgressModal
          reportId={report.id}
          ventureIdea={activeIdea}
          onClose={() => { setActiveIdea(null); loadFull(); }}
        />
      )}
    </div>
  );
}

export default DeepResearchReportPage;
