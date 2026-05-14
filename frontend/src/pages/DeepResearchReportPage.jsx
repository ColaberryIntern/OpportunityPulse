import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  getDeepResearchReport, getDeepResearchStatus, reRunReport, setReportFlags,
} from '../services/deepResearchService';
import RequirementsProgressModal from '../components/deepResearch/RequirementsProgressModal';
import {
  MarketStageBadge, RecommendationBadge, ConvergenceBadge, ConfidenceGauge, ScoreBar,
  CorrelationStrengthBar, SignalHeatStrip, CompositeScoreChip,
} from '../components/deepResearch/IntelVisuals';

// Deep Research Phase 2 — the executive report page.
//
// The Phase 1 dashboard plus the four intelligence engines surfaced:
// cross-channel correlation (convergence + acceleration + signal heat),
// the deterministic market timing read, monetization models, and the
// 8-dimension venture scoring on each idea. Re-run + favorite live in the
// header. Light theme, editorial.

const REVENUE_META = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-emerald-100 text-emerald-700',
  very_high: 'bg-emerald-200 text-emerald-800',
};
const COMPLEXITY_META = {
  low: 'text-emerald-600', medium: 'text-amber-600', high: 'text-red-600',
};
const POLL_MS = 2000;

function Section({ title, children, testId, right }) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-6 mb-5" data-testid={testId}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function VentureIdeaCard({ idea, onGenerate }) {
  const revenueCls = REVENUE_META[idea.revenuePotential] || REVENUE_META.medium;
  const arch = idea.metadata && idea.metadata.suggested_architecture;
  const customers = idea.metadata && idea.metadata.target_customers;
  const scores = idea.scores || {};
  const latestJob = (idea.generationJobs || []).slice().sort((a, b) => b.id - a.id)[0];
  return (
    <div className="border border-gray-200 rounded-lg p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {idea.compositeScore != null && <CompositeScoreChip score={idea.compositeScore} />}
          <h3 className="text-base font-semibold text-gray-900">{idea.title}</h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {idea.recommendationLevel && <RecommendationBadge level={idea.recommendationLevel} />}
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${revenueCls}`}>
            {(idea.revenuePotential || 'medium').replace('_', ' ')} rev
          </span>
        </div>
      </div>
      {idea.description && <p className="text-sm text-gray-600 mt-2">{idea.description}</p>}

      {/* 8-dimension venture scoring */}
      {Object.keys(scores).length > 0 && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 bg-gray-50 rounded-lg p-3">
          {Object.entries(scores).map(([dim, val]) => (
            <ScoreBar key={dim} label={dim} value={val} />
          ))}
        </div>
      )}

      <dl className="mt-3 space-y-2 text-sm">
        {idea.mvpScope && (
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">MVP Scope</dt>
            <dd className="text-gray-700">{idea.mvpScope}</dd></div>
        )}
        {idea.monetizationStrategy && (
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">Monetization</dt>
            <dd className="text-gray-700">{idea.monetizationStrategy}</dd></div>
        )}
        {idea.gtmSummary && (
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">Go-to-Market</dt>
            <dd className="text-gray-700">{idea.gtmSummary}</dd></div>
        )}
        {arch && (
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">Suggested Architecture</dt>
            <dd className="text-gray-700">{arch}</dd></div>
        )}
        {customers && (
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">Target Customers</dt>
            <dd className="text-gray-700">{customers}</dd></div>
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

function MonetizationCard({ model }) {
  const complexityCls = COMPLEXITY_META[model.implementationComplexity] || 'text-gray-500';
  const fit = model.fitScore != null ? Math.round(Number(model.fitScore) * 100) : null;
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-sm font-semibold text-gray-900 capitalize">{model.modelType}</h4>
        {fit != null && (
          <span className="text-xs font-medium text-gray-500" title="Deterministic fit score from channel signal">
            {fit}% fit
          </span>
        )}
      </div>
      {model.pricingSuggestion && (
        <p className="text-xs text-gray-600 mt-1"><span className="text-gray-400">Pricing:</span> {model.pricingSuggestion}</p>
      )}
      {model.idealIcp && (
        <p className="text-xs text-gray-600 mt-1"><span className="text-gray-400">ICP:</span> {model.idealIcp}</p>
      )}
      {model.revenueModel && (
        <p className="text-xs text-gray-600 mt-1"><span className="text-gray-400">Revenue:</span> {model.revenueModel}</p>
      )}
      {model.implementationComplexity && (
        <p className={`text-xs mt-1 font-medium ${complexityCls}`}>
          {model.implementationComplexity} implementation complexity
        </p>
      )}
    </div>
  );
}

function DeepResearchReportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [err, setErr] = useState(null);
  const [activeIdea, setActiveIdea] = useState(null);
  const [busy, setBusy] = useState(false);
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
      if (s.status !== 'running') {
        if (timerRef.current) clearInterval(timerRef.current);
        loadFull();
      }
    } catch (e) {
      if (timerRef.current) clearInterval(timerRef.current);
      setErr(e?.response?.data?.message || e.message || 'Failed to load report status');
    }
  }, [id, loadFull]);

  useEffect(() => {
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

  async function handleReRun() {
    setBusy(true);
    setErr(null);
    try {
      const r = await reRunReport(id);
      setReport(r);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Re-run failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleFavorite() {
    setBusy(true);
    try {
      await setReportFlags(id, { favorite: !report.isFavorite });
      await loadFull();
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  if (err) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Link to="/admin/deep-research" className="text-sm text-blue-600">← Deep Research</Link>
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
        <p className="text-sm text-gray-500 mt-2">Search: <strong>{report.searchTerm}</strong></p>
        <div className="mt-4 inline-block w-48 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-600 animate-pulse" style={{ width: '60%' }} />
        </div>
      </div>
    );
  }

  const rj = report.reportJson || {};
  const correlation = report.signalCorrelation || rj.correlation || {};
  const timing = rj.market_timing || {};
  const ideas = report.ventureIdeas || [];
  const monetization = report.monetizationModels || [];
  const confidence = report.confidenceScore != null ? Number(report.confidenceScore) : null;
  const signalBreakdown = correlation.signalBreakdown || correlation.signal_breakdown || [];
  const chartData = signalBreakdown.map((s) => ({
    name: s.label, score: Math.round((Number(s.signal_score) || 0) * 100), accel: Number(s.acceleration) || 1,
  }));

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-5">
          <Link to="/admin/deep-research" className="text-sm text-blue-600">← Deep Research</Link>
          <div className="flex items-start justify-between gap-4 mt-2">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {report.isFavorite ? '⭐ ' : ''}Deep Research: {report.searchTerm}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {report.origin === 'daily_scan' ? 'Automated daily scan' : 'Manual research'}
                {' · '}{report.sourceCount} sources
                {' · v'}{report.version}
                {report.versionCount > 0 && ` (${report.versionCount} prior)`}
                {report.status === 'partial' && <span className="ml-1 text-amber-600">· partial</span>}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <MarketStageBadge stage={report.marketStage} size="lg" />
              <button
                type="button" onClick={handleFavorite} disabled={busy}
                className="text-lg disabled:opacity-40" title="Favorite"
              >
                {report.isFavorite ? '★' : '☆'}
              </button>
              <button
                type="button" onClick={handleReRun} disabled={busy}
                className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                data-testid="rerun-button"
              >
                {busy ? 'Working…' : '↻ Re-Run Research'}
              </button>
            </div>
          </div>
        </div>

        {/* Executive Summary */}
        <Section title="Executive Summary" testId="section-executive-summary">
          <p className="text-gray-800 leading-relaxed">
            {report.executiveSummary || 'No executive summary available.'}
          </p>
        </Section>

        {/* Cross-Channel Correlation — the Phase 2 headline */}
        <Section
          title="Cross-Channel Correlation"
          testId="section-correlation"
          right={correlation.convergenceType || correlation.convergence_type
            ? <ConvergenceBadge type={correlation.convergenceType || correlation.convergence_type} />
            : null}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <CorrelationStrengthBar
                strength={correlation.correlationStrength != null
                  ? correlation.correlationStrength : correlation.correlation_strength}
                acceleration={correlation.acceleration}
              />
              <div className="mt-3">
                <div className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">Signal heat by channel</div>
                <SignalHeatStrip signals={signalBreakdown} />
              </div>
            </div>
            {chartData.length > 0 && (
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Channel signal scores</div>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                    <Tooltip />
                    <Bar dataKey="score" radius={[3, 3, 0, 0]}>
                      {chartData.map((d) => (
                        <Cell key={d.name} fill={d.accel >= 1.3 ? '#7c3aed' : d.accel <= 0.8 ? '#dc2626' : '#2563eb'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          {(correlation.supportingEvidence || correlation.supporting_evidence || []).length > 0 && (
            <ul className="list-disc pl-5 mt-4 space-y-1 text-sm text-gray-700">
              {(correlation.supportingEvidence || correlation.supporting_evidence).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </Section>

        {/* Market Timing */}
        <Section
          title="Market Timing"
          testId="section-market-timing"
          right={<MarketStageBadge stage={timing.stage || report.marketStage} />}
        >
          <div className="flex items-start gap-6">
            {timing.confidence != null && (
              <ConfidenceGauge value={timing.confidence} label="Timing confidence" />
            )}
            <div className="flex-1">
              <p className="text-gray-700">{timing.rationale || rj.market_timing_narrative || '—'}</p>
              {timing.momentum != null && (
                <div className="flex gap-4 mt-2 text-xs text-gray-500">
                  <span>Momentum: <strong className="text-gray-700">{Math.round(timing.momentum * 100)}</strong></span>
                  <span>Maturity: <strong className="text-gray-700">{Math.round((timing.maturity || 0) * 100)}</strong></span>
                  <span>Timing score: <strong className="text-gray-700">{Math.round((timing.timing_score || 0) * 100)}</strong></span>
                </div>
              )}
              {rj.trend_summary && <p className="text-sm text-gray-500 mt-2">Trend: {rj.trend_summary}</p>}
            </div>
          </div>
        </Section>

        {/* Opportunity Signals */}
        <Section title="Opportunity Signals" testId="section-opportunity-signals">
          {(rj.opportunity_signals || []).length > 0 ? (
            <ul className="list-disc pl-5 space-y-1.5 text-gray-700">
              {rj.opportunity_signals.map((s) => <li key={s}>{s}</li>)}
            </ul>
          ) : <p className="text-gray-400">No signals identified.</p>}
        </Section>

        {/* Venture Ideas */}
        <Section
          title={`Venture Ideas (${ideas.length})`}
          testId="section-venture-ideas"
          right={report.commercializationScore != null
            ? <span className="text-xs text-gray-500">Commercialization score:{' '}
              <strong className="text-gray-800">{Math.round(report.commercializationScore)}</strong></span>
            : null}
        >
          {ideas.length > 0 ? (
            <div className="space-y-4">
              {ideas.map((idea) => (
                <VentureIdeaCard key={idea.id} idea={idea} onGenerate={setActiveIdea} />
              ))}
            </div>
          ) : (
            <p className="text-gray-400">
              No venture ideas were generated{report.status === 'partial' ? ' — synthesis was degraded.' : '.'}
            </p>
          )}
        </Section>

        {/* Monetization Models */}
        <Section title={`Monetization Models (${monetization.length})`} testId="section-monetization">
          {monetization.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {monetization.map((m) => <MonetizationCard key={m.id || m.modelType} model={m} />)}
            </div>
          ) : <p className="text-gray-400">No monetization models generated.</p>}
          {rj.monetization_strategy && (
            <p className="text-sm text-gray-600 mt-3 pt-3 border-t border-gray-100">
              <span className="text-gray-400">Primary strategy:</span> {rj.monetization_strategy}
            </p>
          )}
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

        {/* Build Recommendation */}
        <Section title="Build Recommendation" testId="section-build-recommendation">
          <p className="text-gray-800 font-medium">{rj.build_recommendation || '—'}</p>
        </Section>

        <p className="text-xs text-gray-400 text-center mt-2 mb-8">
          Deep Research Intelligence Engine · Phase 2 · confidence{' '}
          {confidence != null ? `${Math.round(confidence * 100)}%` : 'n/a'}
          {rj.generated_at ? ` · ${new Date(rj.generated_at).toLocaleString()}` : ''}
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
