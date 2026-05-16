import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  getPursuit, updatePursuit, deletePursuit, createPursuit, listPursuits,
  myOpportunitiesContextUrl,
  generatePursuitDrafts, listPursuitHandoffs,
  scorePursuitReadiness, getPursuitReadiness,
  buildCaptureStrategy, getCaptureStrategy,
  listSubmissionArtifacts, addSubmissionArtifact,
  applySubmissionTemplate, updateSubmissionArtifact,
  // Phase 9
  getComplianceMatrix, buildComplianceMatrix, updateComplianceMatrixItem,
  scoreSubmissionReadiness, enqueueParallelDrafts,
  listProposalTimeline, seedDefaultTimeline,
  listComplianceGaps, refreshComplianceGaps, updateComplianceGap,
  listRfpAttachments, addRfpAttachment, summarizeRfpAttachments,
  assembleSubmissionPackage, listSubmissionPackages,
} from '../services/deepResearchService';
import {
  OpportunityRow, JustificationCard, PursuitStatusPill, StatCard, EvidenceDrawer,
} from '../components/deepResearch/ActionVisuals';

// Deep Research Phase 7 — Proposal Pursuit Workspace.
// Single-pursuit view at /admin/deep-research/pursuits/:id
// "new" mode at /admin/deep-research/pursuits/new (optional ?opportunity=N).

function Section({ title, subtitle, right, children, testId }) {
  return (
    <section
      className="bg-white border border-gray-200 rounded-xl p-6 mb-5"
      data-testid={testId}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function CreatePursuitForm({ defaultOppId }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '', anchorKind: 'opportunity', anchorId: defaultOppId || '', summary: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const created = await createPursuit({
        name: form.name,
        anchorKind: form.anchorKind,
        anchorId: form.anchorId ? Number(form.anchorId) : null,
        summary: form.summary,
        linkedOpportunityIds: form.anchorKind === 'opportunity' && form.anchorId
          ? [Number(form.anchorId)] : [],
      });
      navigate(`/admin/deep-research/pursuits/${created.id}`);
    } catch (e2) {
      setErr(e2?.response?.data?.message || e2.message || 'Create failed');
      setBusy(false);
    }
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-2xl mx-auto">
        <Link to="/admin/deep-research/action-intelligence" className="text-xs text-cyan-700 hover:underline">
          ← Action Intelligence
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">New Pursuit Workspace</h1>
        <p className="text-sm text-gray-500 mt-1 mb-6">
          A planning surface for an upcoming proposal. The pursuit links opportunities + acceleration
          assets + a justification snapshot. <strong>No auto-submission</strong> — every move is human-led.
        </p>
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-gray-200 rounded-xl p-6 space-y-4"
        >
          {err && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
          )}
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pursuit name</span>
            <input
              required
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="mt-1 w-full text-sm px-3 py-2 border border-gray-300 rounded"
              placeholder="DHA healthcare data analytics pursuit"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Anchor kind</span>
              <select
                value={form.anchorKind}
                onChange={(e) => setForm((f) => ({ ...f, anchorKind: e.target.value }))}
                className="mt-1 w-full text-sm px-3 py-2 border border-gray-300 rounded"
              >
                <option value="opportunity">Single opportunity</option>
                <option value="venture">Venture idea</option>
                <option value="cluster">Strategic cluster</option>
                <option value="pattern">Venture pattern</option>
                <option value="custom">Custom set</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Anchor ID</span>
              <input
                type="number"
                value={form.anchorId}
                onChange={(e) => setForm((f) => ({ ...f, anchorId: e.target.value }))}
                className="mt-1 w-full text-sm px-3 py-2 border border-gray-300 rounded"
                placeholder="e.g. 41"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Summary (optional)</span>
            <textarea
              value={form.summary}
              onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
              rows={4}
              className="mt-1 w-full text-sm px-3 py-2 border border-gray-300 rounded font-sans"
              placeholder="What this pursuit is about, the angle we're taking…"
            />
          </label>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-md bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-700 disabled:opacity-40"
            >
              {busy ? 'Creating…' : 'Create Pursuit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PursuitWorkspacePage() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [note, setNote] = useState('');
  const [drawer, setDrawer] = useState(null);

  const isNew = id === 'new';

  // Phase 8 panel state.
  const [readiness, setReadiness] = useState(null);
  const [capture, setCapture] = useState(null);
  const [submission, setSubmission] = useState(null);
  const [handoffs, setHandoffs] = useState([]);
  const [handoffResult, setHandoffResult] = useState(null);
  // Phase 9 panel state.
  const [matrix, setMatrix] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [gaps, setGaps] = useState([]);
  const [rfpAttachments, setRfpAttachments] = useState([]);
  const [packages, setPackages] = useState([]);
  const [rfpText, setRfpText] = useState('');

  const load = useCallback(async () => {
    if (isNew) return;
    setLoading(true); setErr(null);
    try {
      const [main, r, cap, sub, h, m, t, g, a, p] = await Promise.all([
        getPursuit(id),
        getPursuitReadiness(id).catch(() => null),
        getCaptureStrategy(id).catch(() => null),
        listSubmissionArtifacts(id).catch(() => null),
        listPursuitHandoffs(id).catch(() => []),
        getComplianceMatrix(id).catch(() => null),
        listProposalTimeline(id).catch(() => []),
        listComplianceGaps(id, { status: 'open' }).catch(() => []),
        listRfpAttachments(id).catch(() => []),
        listSubmissionPackages(id).catch(() => []),
      ]);
      setData(main); setReadiness(r); setCapture(cap); setSubmission(sub); setHandoffs(h || []);
      setMatrix(m); setTimeline(t || []); setGaps(g || []);
      setRfpAttachments(a || []); setPackages(p || []);
    } catch (e) { setErr(e?.response?.data?.message || e.message || 'Failed to load pursuit'); }
    finally { setLoading(false); }
  }, [id, isNew]);
  useEffect(() => { load(); }, [load]);

  async function withBusy(fn, errLabel) {
    setBusy(true); setErr(null);
    try { await fn(); await load(); }
    catch (e) { setErr(e?.response?.data?.message || e.message || errLabel); }
    finally { setBusy(false); }
  }

  if (isNew) {
    return <CreatePursuitForm defaultOppId={search.get('opportunity')} />;
  }

  if (loading && !data) {
    return <div className="p-6 text-center text-gray-500">Loading pursuit…</div>;
  }
  if (!data) {
    return <div className="p-6 text-center text-gray-500">Pursuit not found.</div>;
  }

  const linkedOpps = data.opportunities || [];
  const outputs = data.linked_outputs || [];
  const assets = data.asset_suggestions || [];
  const evidence = data.evidence_opportunities || [];
  const justification = data.justification;
  const staffing = data.staffing_recommendation || {};
  const readinessSummary = data.readiness_summary || {};

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <Link
              to="/admin/deep-research/action-intelligence"
              className="text-xs text-cyan-700 hover:underline"
            >
              ← Action Intelligence
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 mt-1 flex items-center gap-2">
              🎯 {data.name}
              <PursuitStatusPill status={data.status} />
            </h1>
            {data.anchor && (
              <p className="text-sm text-gray-500 mt-1">
                Anchored to {data.anchor.kind}{' '}
                {data.anchor.name || data.anchor.title || `#${data.anchor.id}`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to={myOpportunitiesContextUrl('pursuit', data.id)}
              className="px-3 py-2 rounded-md bg-cyan-600 text-white text-xs font-semibold hover:bg-cyan-700"
              data-testid="pursuit-open-in-my-opps"
            >
              Open in My Opportunities →
            </Link>
            <select
              value={data.status}
              onChange={(e) => withBusy(
                () => updatePursuit(data.id, { status: e.target.value }),
                'Status update failed',
              )}
              disabled={busy}
              className="text-xs px-2 py-2 rounded border border-gray-300"
            >
              {['open', 'in_progress', 'submitted', 'won', 'lost', 'archived'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                if (!window.confirm('Delete this pursuit?')) return;
                withBusy(async () => {
                  await deletePursuit(data.id);
                  navigate('/admin/deep-research/action-intelligence');
                }, 'Delete failed');
              }}
              disabled={busy}
              className="px-3 py-2 rounded-md bg-red-50 text-red-700 text-xs font-medium hover:bg-red-100 disabled:opacity-40"
            >
              Delete
            </button>
          </div>
        </header>

        {err && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
        )}

        {data.summary && (
          <Section title="Summary" testId="section-summary">
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{data.summary}</p>
          </Section>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <StatCard label="Linked Opps" value={linkedOpps.length} />
          <StatCard
            label="Mean AI Score"
            value={readinessSummary.mean_score != null ? Number(readinessSummary.mean_score).toFixed(0) : '—'}
            sub={`${readinessSummary.with_score || 0} of ${readinessSummary.count || 0} scored`}
          />
          <StatCard label="Reusable Assets" value={assets.length} sub="suggested" />
          <StatCard label="Draft Outputs" value={outputs.length} sub="proposal/offer/analysis" />
        </div>

        {justification && (
          <Section title="Strategic Justification" testId="section-justification">
            <JustificationCard
              justification={justification}
              onShowEvidence={() => setDrawer({
                title: `Evidence behind ${data.anchor?.kind || 'anchor'} #${data.anchor?.id || ''}`,
                subtitle: 'Underlying opportunities that support the anchor of this pursuit.',
                opportunities: evidence,
              })}
            />
          </Section>
        )}

        <Section
          title="Linked Opportunities"
          subtitle="Opportunities you're pursuing under this workspace."
          testId="section-linked-opps"
        >
          {linkedOpps.length === 0 ? (
            <div className="text-xs text-gray-400 italic">No opportunities linked yet.</div>
          ) : (
            <div className="grid gap-2">
              {linkedOpps.map((o) => <OpportunityRow key={o.id} opp={o} />)}
            </div>
          )}
        </Section>

        <Section
          title="Suggested Positioning"
          subtitle="Editable. Goes into the proposal cover or summary."
          testId="section-positioning"
        >
          <textarea
            defaultValue={data.positioning || ''}
            onBlur={(e) => {
              if (e.target.value !== (data.positioning || '')) {
                withBusy(
                  () => updatePursuit(data.id, { positioning: e.target.value }),
                  'Update failed',
                );
              }
            }}
            rows={4}
            className="w-full text-sm px-3 py-2 border border-gray-300 rounded font-sans"
            placeholder="Why we win. What we bring. How we frame the bid…"
          />
        </Section>

        <Section
          title="Reusable Proposal Components"
          subtitle="Past wins + capability blurbs + NAICS / agency history matched to the linked opps."
          testId="section-assets"
        >
          {assets.length === 0 ? (
            <div className="text-xs text-gray-400 italic">
              No matching reusable components yet — link opportunities or refresh acceleration assets.
            </div>
          ) : (
            <div className="grid gap-2">
              {assets.map((a) => (
                <div key={a.id} className="rounded border border-gray-200 p-3 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-sm font-semibold text-gray-900">{a.label}</h4>
                    <span className="text-[11px] text-gray-500 font-mono">
                      {a.assetKind} · score {Math.round(a._suggest_score || 0)}
                    </span>
                  </div>
                  {a.content && (
                    <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">{a.content}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Staffing Recommendation"
          testId="section-staffing"
        >
          <div className="text-sm text-gray-700">
            <p>
              <span className="font-semibold">Lead:</span> {staffing.lead || '—'}
            </p>
            <p>
              <span className="font-semibold">Support:</span>{' '}
              {(staffing.support || []).join(', ') || '—'}
            </p>
            {staffing.note && <p className="text-xs text-gray-500 mt-2 italic">{staffing.note}</p>}
          </div>
        </Section>

        <Section title="Notes" subtitle="Append-only journal." testId="section-notes">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!note.trim()) return;
              withBusy(async () => {
                await updatePursuit(data.id, { note });
                setNote('');
              }, 'Note failed');
            }}
            className="flex gap-2 mb-3"
          >
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="flex-1 text-sm px-3 py-2 border border-gray-300 rounded"
              placeholder="Add a note (e.g. 'Spoke with agency POC, follow up Friday')"
            />
            <button
              type="submit"
              disabled={busy || !note.trim()}
              className="px-3 py-2 rounded-md bg-cyan-600 text-white text-xs font-medium hover:bg-cyan-700 disabled:opacity-40"
            >
              Add
            </button>
          </form>
          <ul className="space-y-2 text-xs">
            {(data.notes || []).map((n, i) => (
              <li key={i} className="border-l-2 border-cyan-300 pl-2">
                <p className="text-gray-700">{n.note}</p>
                <p className="text-[10px] text-gray-400">{new Date(n.at).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        </Section>

        {/* Phase 8 — Generate Proposal Drafts (Review Queue handoff). */}
        <Section
          title="Generate Proposal Drafts"
          subtitle="One click runs the existing actionGenerator for every linked opportunity and drops drafts in the Review Queue. Human review + human submission still required."
          testId="section-generate-drafts"
          right={
            <button
              type="button"
              onClick={() => withBusy(async () => {
                const out = await generatePursuitDrafts(data.id);
                setHandoffResult(out);
              }, 'Draft generation failed')}
              disabled={busy || linkedOpps.length === 0}
              className="px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-40"
              data-testid="generate-drafts-btn"
            >
              {busy ? 'Generating…' : 'Generate Drafts'}
            </button>
          }
        >
          {handoffResult && (
            <div className="mb-3 text-xs text-gray-700">
              Latest run — requested {handoffResult.requested},
              <span className="text-emerald-700 font-semibold"> {handoffResult.succeeded} succeeded</span>,
              {handoffResult.failed > 0 && (
                <span className="text-red-700 font-semibold"> {handoffResult.failed} failed,</span>
              )}
              <span className="text-gray-500"> {handoffResult.skipped} skipped</span>.
            </div>
          )}
          {handoffs.length === 0 ? (
            <p className="text-xs text-gray-500 italic">
              No drafts generated yet. Click "Generate Drafts" above to start one.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-200">
                  <th className="text-left py-1 px-2">When</th>
                  <th className="text-left py-1 px-2">Opportunity</th>
                  <th className="text-left py-1 px-2">Type</th>
                  <th className="text-left py-1 px-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {handoffs.slice(0, 20).map((h) => (
                  <tr key={h.id} className="border-b border-gray-100" data-testid={`handoff-${h.id}`}>
                    <td className="py-1 px-2 text-gray-700">
                      {new Date(h.createdAt).toLocaleString()}
                    </td>
                    <td className="py-1 px-2">opp #{h.opportunityId}</td>
                    <td className="py-1 px-2">{h.outputType}</td>
                    <td className="py-1 px-2">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        h.status === 'success' ? 'bg-emerald-100 text-emerald-800'
                          : h.status === 'failed' ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-600'
                      }`}>{h.status}</span>
                      {h.errorMessage && (
                        <span className="ml-2 text-[11px] text-red-700">{h.errorMessage.slice(0, 80)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* Phase 8 — Proposal Readiness scoring. */}
        <Section
          title="Proposal Readiness"
          subtitle="Composite 0-100 readiness score across staffing / capability / compliance / assets / dependency / acceleration."
          testId="section-readiness"
          right={
            <button
              type="button"
              onClick={() => withBusy(() => scorePursuitReadiness(data.id), 'Readiness scoring failed')}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-40"
            >
              {readiness ? 'Re-score' : 'Score Readiness'}
            </button>
          }
        >
          {!readiness ? (
            <p className="text-xs text-gray-500 italic">
              No readiness score yet — click the button to compute one.
            </p>
          ) : (
            <div>
              <div className="flex items-baseline gap-3 mb-3">
                <span className="text-3xl font-bold text-gray-900">
                  {Number(readiness.compositeScore).toFixed(0)}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                  readiness.classification === 'ready' ? 'bg-emerald-100 text-emerald-800'
                    : readiness.classification === 'needs_prep' ? 'bg-amber-100 text-amber-800'
                      : 'bg-red-100 text-red-700'
                }`}>{readiness.classification}</span>
                <span className="text-xs text-gray-500">
                  expected effort ~{Number(readiness.expectedEffortHours || 0).toFixed(0)}h
                </span>
                <span className="text-xs text-gray-500">
                  submission risk {Number(readiness.submissionRisk || 0).toFixed(0)}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs mb-3">
                {[
                  ['Staffing', readiness.staffingReadiness],
                  ['Capability', readiness.capabilityReadiness],
                  ['Compliance', readiness.complianceReadiness],
                  ['Assets', readiness.assetReadiness],
                  ['Dependency', readiness.dependencyReadiness],
                  ['Acceleration', readiness.accelerationPct],
                ].map(([label, score]) => (
                  <div key={label} className="rounded border border-gray-200 p-2">
                    <div className="flex justify-between mb-0.5">
                      <span className="text-gray-600">{label}</span>
                      <span className="text-gray-900 font-semibold">{Number(score).toFixed(0)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-500" style={{ width: `${Math.min(100, Number(score))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              {Array.isArray(readiness.blockers) && readiness.blockers.length > 0 && (
                <div className="mb-2">
                  <h4 className="text-[11px] font-semibold uppercase text-gray-500 mb-1">Blockers</h4>
                  <ul className="space-y-0.5 text-xs">
                    {readiness.blockers.map((b, i) => <li key={i} className="text-red-700">• {b}</li>)}
                  </ul>
                </div>
              )}
              {Array.isArray(readiness.accelerators) && readiness.accelerators.length > 0 && (
                <div className="mb-2">
                  <h4 className="text-[11px] font-semibold uppercase text-gray-500 mb-1">Accelerators</h4>
                  <ul className="space-y-0.5 text-xs">
                    {readiness.accelerators.map((a, i) => <li key={i} className="text-emerald-700">• {a}</li>)}
                  </ul>
                </div>
              )}
              {readiness.rationale && (
                <p className="text-[11px] text-gray-500 italic">{readiness.rationale}</p>
              )}
            </div>
          )}
        </Section>

        {/* Phase 8 — Capture Strategy. */}
        <Section
          title="Capture Strategy"
          subtitle="Capture-plan intelligence: evaluator priorities, agency pain points, differentiators, incumbent risks."
          testId="section-capture-strategy"
          right={
            <button
              type="button"
              onClick={() => withBusy(() => buildCaptureStrategy(data.id), 'Capture strategy build failed')}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-40"
            >
              {capture ? 'Re-build' : 'Build Capture Strategy'}
            </button>
          }
        >
          {!capture ? (
            <p className="text-xs text-gray-500 italic">
              No capture strategy yet — click the button to compose one.
            </p>
          ) : (
            <div>
              {capture.narrative && (
                <p className="text-sm text-gray-700 mb-3">{capture.narrative}</p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {[
                  ['Evaluator priorities', capture.evaluatorPriorities],
                  ['Agency pain points', capture.agencyPainPoints],
                  ['Differentiators', capture.differentiators],
                  ['Positioning', capture.positioningRecommendations],
                ].map(([title, list]) => (
                  <section key={title} className="border border-gray-200 rounded-lg p-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">{title}</h4>
                    {!Array.isArray(list) || list.length === 0 ? (
                      <p className="text-gray-400 italic">None.</p>
                    ) : (
                      <ul className="space-y-0.5">
                        {list.slice(0, 4).map((row, i) => (
                          <li key={i} className="text-gray-700">• {row.label}</li>
                        ))}
                      </ul>
                    )}
                  </section>
                ))}
              </div>
              {Array.isArray(capture.incumbentRisks) && capture.incumbentRisks.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Incumbent Risks</h4>
                  <ul className="space-y-1 text-xs">
                    {capture.incumbentRisks.map((r, i) => (
                      <li key={i} className="rounded border border-amber-200 bg-amber-50 px-2 py-1">
                        <span className="font-semibold">{r.incumbent}</span> ({r.vendor}) ·
                        momentum {r.momentum} · severity {r.severity} — {r.notes}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {Array.isArray(capture.partnershipOpportunities) && capture.partnershipOpportunities.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Partnership Opportunities</h4>
                  <ul className="space-y-1 text-xs">
                    {capture.partnershipOpportunities.map((p, i) => (
                      <li key={i} className="text-gray-700">• <span className="font-semibold">{p.partner}</span> — {p.rationale}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* Phase 8 — Submission Readiness Foundations. */}
        <Section
          title="Submission Readiness"
          subtitle="Track the artifacts every submission needs. Foundations only — Phase 9 will wire RFP attachments + compliance matrix."
          testId="section-submission"
          right={
            <button
              type="button"
              onClick={() => withBusy(() => applySubmissionTemplate(data.id), 'Template apply failed')}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-40"
            >
              Apply Default Template
            </button>
          }
        >
          {(!submission || !submission.artifacts || submission.artifacts.length === 0) ? (
            <p className="text-xs text-gray-500 italic">
              No artifacts tracked yet. Click "Apply Default Template" to seed a punch-list.
            </p>
          ) : (
            <div>
              <div className="flex items-baseline gap-4 mb-3 text-xs">
                <span className="font-semibold text-gray-700">
                  {submission.summary.ready} / {submission.summary.total} ready
                  ({submission.summary.completion_pct}%)
                </span>
                {submission.summary.missing > 0 && (
                  <span className="text-red-700">{submission.summary.missing} missing</span>
                )}
                {submission.summary.in_progress > 0 && (
                  <span className="text-amber-700">{submission.summary.in_progress} in progress</span>
                )}
              </div>
              <ul className="space-y-1.5 text-xs">
                {submission.artifacts.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 border border-gray-200 rounded px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                      a.status === 'ready' || a.status === 'reviewed' ? 'bg-emerald-100 text-emerald-800'
                        : a.status === 'in_progress' ? 'bg-amber-100 text-amber-800'
                          : 'bg-red-100 text-red-700'
                    }`}>{a.status}</span>
                    <span className="flex-1 text-gray-900">{a.label}</span>
                    <select
                      value={a.status}
                      onChange={(e) => withBusy(
                        () => updateSubmissionArtifact(a.id, { status: e.target.value }),
                        'Update failed',
                      )}
                      disabled={busy}
                      className="text-[11px] px-2 py-1 rounded border border-gray-300"
                    >
                      {['missing', 'in_progress', 'ready', 'reviewed'].map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        {/* Phase 9 — Submission Readiness Score (composite). */}
        <Section
          title="Submission Readiness Score (Phase 9 Composite)"
          subtitle="7-dimension composite over compliance, attachments, artifacts, package, staffing, capability, timeline."
          testId="section-phase9-readiness"
          right={
            <button
              type="button"
              onClick={() => withBusy(() => scoreSubmissionReadiness(data.id), 'Score failed')}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-40"
            >
              Score Submission Readiness
            </button>
          }
        >
          <p className="text-xs text-gray-500 italic">
            Click "Score Submission Readiness" to compute the Phase 9 composite. Reads compliance matrix,
            RFP attachment locker, proposal artifact vault, submission packages, staffing/capability,
            and timeline health. Result lands in the Proposal Readiness panel above.
          </p>
        </Section>

        {/* Phase 9 — Compliance Matrix. */}
        <Section
          title="Compliance Matrix"
          subtitle="Parsed RFP requirements + standard template. Mark each row satisfied / partial / missing."
          testId="section-compliance-matrix"
          right={
            <button
              type="button"
              onClick={() => withBusy(() => buildComplianceMatrix(data.id, { rfpText }), 'Matrix build failed')}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-40"
            >
              {matrix ? 'Re-build matrix' : 'Build matrix'}
            </button>
          }
        >
          <textarea
            value={rfpText}
            onChange={(e) => setRfpText(e.target.value)}
            placeholder="Paste RFP text here for richer matrix parsing (optional — leaves a standard template if empty)…"
            rows={3}
            className="w-full text-xs px-2 py-1 border border-gray-300 rounded mb-3 font-sans"
          />
          {!matrix ? (
            <p className="text-xs text-gray-500 italic">No matrix yet. Click "Build matrix".</p>
          ) : (
            <div>
              <div className="flex items-baseline gap-3 mb-3 text-sm">
                <span className="text-2xl font-bold text-gray-900">{Number(matrix.matrix.completionPct).toFixed(0)}%</span>
                <span className="text-xs text-gray-500">
                  {matrix.matrix.satisfiedCount} satisfied · {matrix.matrix.partialCount} partial ·
                  {' '}{matrix.matrix.missingCount} missing of {matrix.matrix.totalCount}
                </span>
              </div>
              <ul className="space-y-1 text-xs max-h-[400px] overflow-y-auto">
                {(matrix.items || []).map((it) => (
                  <li key={it.id} className="flex items-center gap-2 border border-gray-200 rounded px-2 py-1">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                      it.severity === 'critical' ? 'bg-red-100 text-red-700'
                        : it.severity === 'high' ? 'bg-amber-100 text-amber-800'
                          : 'bg-gray-100 text-gray-600'
                    }`}>{it.itemKind}</span>
                    <span className="flex-1 text-gray-900 truncate" title={it.label}>{it.label}</span>
                    <select
                      value={it.status}
                      onChange={(e) => withBusy(
                        () => updateComplianceMatrixItem(it.id, { status: e.target.value }),
                        'Update failed',
                      )}
                      disabled={busy}
                      className={`text-[11px] px-2 py-0.5 rounded border ${
                        it.status === 'satisfied' ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                          : it.status === 'partial' ? 'bg-amber-50 border-amber-300 text-amber-800'
                            : 'bg-red-50 border-red-300 text-red-700'
                      }`}
                    >
                      {['satisfied', 'partial', 'missing', 'na'].map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        {/* Phase 9 — Compliance Gaps. */}
        <Section
          title="Compliance Gaps"
          subtitle="Auto-detected gaps from the matrix + artifact vault + attachment locker. Recommendation-only."
          testId="section-compliance-gaps"
          right={
            <button
              type="button"
              onClick={() => withBusy(() => refreshComplianceGaps(data.id), 'Refresh failed')}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-40"
            >
              Refresh gaps
            </button>
          }
        >
          {gaps.length === 0 ? (
            <p className="text-xs text-gray-500 italic">No open gaps detected.</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {gaps.slice(0, 12).map((g) => (
                <li key={g.id} className="rounded border border-amber-200 bg-amber-50 px-3 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-gray-900">[{g.gapKind}] {g.label}</span>
                    <span className="text-[11px] font-semibold text-amber-800">
                      severity {Math.round(Number(g.severity))}
                    </span>
                  </div>
                  {Array.isArray(g.recommendedActions) && g.recommendedActions.length > 0 && (
                    <ul className="text-[11px] text-gray-700 ml-3">
                      {g.recommendedActions.slice(0, 2).map((a, i) => <li key={i}>• {a}</li>)}
                    </ul>
                  )}
                  <div className="flex justify-end mt-1">
                    <button
                      type="button"
                      onClick={() => withBusy(() => updateComplianceGap(g.id, { status: 'acknowledged' }), 'Update failed')}
                      disabled={busy}
                      className="text-[11px] px-2 py-0.5 rounded bg-white border border-gray-300 hover:bg-gray-100 mr-1"
                    >
                      Acknowledge
                    </button>
                    <button
                      type="button"
                      onClick={() => withBusy(() => updateComplianceGap(g.id, { status: 'mitigated' }), 'Update failed')}
                      disabled={busy}
                      className="text-[11px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                    >
                      Mitigate
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Phase 9 — RFP Attachments Locker. */}
        <Section
          title="RFP Attachment Locker"
          subtitle="Track RFPs, amendments, supporting docs, Q&A responses, past proposals. Metadata-only in v1."
          testId="section-rfp-locker"
        >
          {rfpAttachments.length === 0 ? (
            <p className="text-xs text-gray-500 italic">No RFP attachments uploaded yet.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {rfpAttachments.slice(0, 30).map((a) => (
                <li key={a.id} className="flex items-center gap-2 border border-gray-200 rounded px-2 py-1">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-violet-100 text-violet-700 font-semibold">
                    {a.attachmentKind}
                  </span>
                  <span className="flex-1 text-gray-900 truncate" title={a.label}>{a.label}</span>
                  <span className="text-[11px] text-gray-500">v{a.version}</span>
                  {a.contentRef && (
                    <a
                      href={a.contentRef}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-cyan-700 hover:underline"
                    >
                      open ↗
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Phase 9 — Proposal Timeline. */}
        <Section
          title="Proposal Timeline"
          subtitle="Append-only event log per pursuit. Track milestones, drafts, compliance, artifacts, blockers."
          testId="section-timeline"
          right={
            <button
              type="button"
              onClick={() => withBusy(() => seedDefaultTimeline(data.id), 'Seed failed')}
              disabled={busy || timeline.length > 0}
              className="text-xs px-3 py-1.5 rounded bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-40"
            >
              Seed default timeline
            </button>
          }
        >
          {timeline.length === 0 ? (
            <p className="text-xs text-gray-500 italic">No timeline yet. Click "Seed default timeline" to start.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {timeline.slice(0, 20).map((e) => (
                <li key={e.id} className="flex items-center gap-2 border-l-2 pl-2 py-0.5"
                  style={{
                    borderColor: e.status === 'done' ? '#10b981'
                      : e.status === 'overdue' ? '#ef4444'
                        : e.status === 'blocked' ? '#f59e0b'
                          : '#94a3b8',
                  }}
                >
                  <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                    e.status === 'done' ? 'bg-emerald-100 text-emerald-800'
                      : e.status === 'overdue' ? 'bg-red-100 text-red-700'
                        : e.status === 'blocked' ? 'bg-amber-100 text-amber-800'
                          : 'bg-gray-100 text-gray-600'
                  }`}>{e.status}</span>
                  <span className="text-gray-700">{e.eventKind}</span>
                  <span className="flex-1 text-gray-900">{e.label}</span>
                  {e.dueAt && (
                    <span className="text-[11px] text-gray-500">{new Date(e.dueAt).toLocaleDateString()}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Phase 9 — Submission Packages. */}
        <Section
          title="Submission Packages"
          subtitle="Assembled proposal packages: drafts + RFP attachments + reusable artifacts. NO auto-submit."
          testId="section-packages"
          right={
            <button
              type="button"
              onClick={() => withBusy(() => assembleSubmissionPackage(data.id), 'Assemble failed')}
              disabled={busy || linkedOpps.length === 0}
              className="text-xs px-3 py-1.5 rounded bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-40"
            >
              Assemble package
            </button>
          }
        >
          {packages.length === 0 ? (
            <p className="text-xs text-gray-500 italic">No packages assembled yet.</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {packages.slice(0, 6).map((p) => (
                <li key={p.id} className="rounded border border-gray-200 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-gray-900">{p.name}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded font-semibold ${
                      p.status === 'ready' ? 'bg-emerald-100 text-emerald-800'
                        : p.status === 'submitted' ? 'bg-violet-100 text-violet-800'
                          : 'bg-gray-100 text-gray-600'
                    }`}>{p.status}</span>
                  </div>
                  <div className="flex items-baseline gap-3">
                    <span className="text-lg font-bold text-gray-900">
                      {Number(p.completenessScore).toFixed(0)}%
                    </span>
                    <span className="text-[11px] text-gray-500">
                      {(p.outputIds || []).length} drafts · {(p.attachmentIds || []).length} attachments ·
                      {' '}{(p.artifactIds || []).length} reusable artifacts
                    </span>
                  </div>
                  {Array.isArray(p.missingComponents) && p.missingComponents.length > 0 && (
                    <p className="text-[11px] text-amber-700 mt-1">
                      Missing: {p.missingComponents.slice(0, 4).join(', ')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Phase 9 — Parallel Draft Generation. */}
        <Section
          title="Parallel Draft Generation"
          subtitle="Runs the Review Queue handoff with bounded concurrency. Faster than the sequential Phase 8 path."
          testId="section-parallel-drafts"
          right={
            <button
              type="button"
              onClick={() => withBusy(async () => {
                const out = await enqueueParallelDrafts(data.id, { concurrency: 3 });
                setHandoffResult(out);
              }, 'Parallel batch failed')}
              disabled={busy || linkedOpps.length === 0}
              className="text-xs px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              Run Parallel Batch
            </button>
          }
        >
          <p className="text-xs text-gray-500 italic">
            Concurrency 3 by default. Idempotent — already-successful drafts are skipped. Results land in
            the Generate Drafts panel above + the Review Queue.
          </p>
        </Section>

        <Section title="Submission Reminder" testId="section-submission-reminder">
          <p className="text-sm text-gray-700">
            <span className="font-semibold text-cyan-700">No auto-submission.</span>{' '}
            This workspace organizes evidence and reusable components. When you're ready, generate
            the final proposal in the Review Queue and submit through the agency portal manually.
          </p>
        </Section>
      </div>

      <EvidenceDrawer
        open={!!drawer}
        onClose={() => setDrawer(null)}
        title={drawer?.title || ''}
        subtitle={drawer?.subtitle || ''}
        opportunities={drawer?.opportunities || []}
      />
    </div>
  );
}

export default PursuitWorkspacePage;
