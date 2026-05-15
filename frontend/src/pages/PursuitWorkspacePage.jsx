import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  getPursuit, updatePursuit, deletePursuit, createPursuit, listPursuits,
  myOpportunitiesContextUrl,
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

  const load = useCallback(async () => {
    if (isNew) return;
    setLoading(true); setErr(null);
    try { setData(await getPursuit(id)); }
    catch (e) { setErr(e?.response?.data?.message || e.message || 'Failed to load pursuit'); }
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
  const readiness = data.readiness_summary || {};

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
            value={readiness.mean_score != null ? Number(readiness.mean_score).toFixed(0) : '—'}
            sub={`${readiness.with_score || 0} of ${readiness.count || 0} scored`}
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
