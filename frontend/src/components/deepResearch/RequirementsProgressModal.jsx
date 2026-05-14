import React, { useCallback, useEffect, useRef, useState } from 'react';
import { generateRequirements, getJobStatus } from '../../services/deepResearchService';

// Deep Research Intelligence Engine — requirements-generation progress modal.
//
// Opened from a venture idea card. On mount it starts a project generation
// job (the AI Project Architect bridge), then polls job status on an
// interval and renders a phase tracker + progress bar. The data model is
// poll-friendly today and SSE-ready for a future phase — this component is
// the only thing that would change.

const POLL_MS = 1200;

function PhaseRow({ phase }) {
  const icon = {
    completed: '✅',
    running: '⏳',
    pending: '◻️',
  }[phase.status] || '◻️';
  const textCls = phase.status === 'completed'
    ? 'text-gray-700'
    : phase.status === 'running'
      ? 'text-indigo-700 font-medium'
      : 'text-gray-400';
  return (
    <li className="flex items-center gap-2 py-1">
      <span aria-hidden="true">{icon}</span>
      <span className={`text-sm ${textCls}`}>{phase.label}</span>
    </li>
  );
}

function RequirementsProgressModal({ reportId, ventureIdea, onClose }) {
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [err, setErr] = useState(null);
  const timerRef = useRef(null);

  // Start the job once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const started = await generateRequirements(reportId, ventureIdea.id);
        if (cancelled) return;
        setJobId(started.job_id);
      } catch (e) {
        if (!cancelled) setErr(e?.response?.data?.message || e.message || 'Failed to start job');
      }
    })();
    return () => { cancelled = true; };
  }, [reportId, ventureIdea.id]);

  const poll = useCallback(async () => {
    if (!jobId) return;
    try {
      const status = await getJobStatus(jobId);
      setJob(status);
      if (status.status === 'success' || status.status === 'failed') {
        if (timerRef.current) clearInterval(timerRef.current);
      }
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed to poll job status');
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [jobId]);

  // Poll while the job is in flight.
  useEffect(() => {
    if (!jobId) return undefined;
    poll();
    timerRef.current = setInterval(poll, POLL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [jobId, poll]);

  const progress = job ? job.progress_percent : 0;
  const phases = (job && job.phases) || [];
  const done = job && job.status === 'success';
  const failed = (job && job.status === 'failed') || Boolean(err);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      data-testid="requirements-progress-modal"
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Generate Requirements</h2>
            <p className="text-sm text-gray-500 mt-0.5">{ventureIdea.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5">
          {failed && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
              {err || (job && job.error) || 'Requirements generation failed.'}
            </div>
          )}

          {/* Progress bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>{job ? job.current_phase || 'Starting…' : 'Queuing…'}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${failed ? 'bg-red-500' : 'bg-indigo-600'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Phase tracker */}
          {phases.length > 0 && (
            <ul className="mb-4 list-none p-0">
              {phases.map((p) => <PhaseRow key={p.key} phase={p} />)}
            </ul>
          )}

          {/* Completed: show the generated requirements scaffold */}
          {done && job.requirements && (
            <div className="mt-4 border-t border-gray-200 pt-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Generated Requirements</h3>
              <dl className="text-sm space-y-1.5">
                <div>
                  <dt className="text-gray-500 text-xs uppercase tracking-wide">Overview</dt>
                  <dd className="text-gray-800">{job.requirements.overview || '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500 text-xs uppercase tracking-wide">MVP Scope</dt>
                  <dd className="text-gray-800">{job.requirements.mvp_scope || '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500 text-xs uppercase tracking-wide">Functional Requirements</dt>
                  <dd className="text-gray-800">
                    <ul className="list-disc pl-5 mt-1">
                      {(job.requirements.functional_requirements || []).map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
              </dl>
              {job.architect_url && (
                <p className="mt-3 text-xs text-gray-500">
                  AI Project Architect handoff:{' '}
                  <code className="bg-gray-100 px-1.5 py-0.5 rounded">{job.architect_url}</code>
                </p>
              )}
              <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                Phase 1 foundation — this scaffold is generated locally. The live Agent Foundry
                handoff lands in a future phase.
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200"
          >
            {done || failed ? 'Close' : 'Run in background'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RequirementsProgressModal;
