import React, { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { listOutputs, patchOutputStatus } from '../services/oiedService';
import renderSafeMarkdown from '../utils/safeMarkdown';

function StatusBadge({ status }) {
  const map = {
    draft: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
    approved: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    rejected: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${map[status] || map.draft}`}>
      {status}
    </span>
  );
}

function TypeChip({ type }) {
  const labels = {
    proposal: '✍️ Proposal',
    offer: '🤝 Offer',
    analysis: '🔍 Analysis',
  };
  return (
    <span className="inline-block px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-xs font-medium text-gray-700 dark:text-gray-200">
      {labels[type] || type}
    </span>
  );
}

function OutputCard({ row, onPatch }) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(row.content);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState(row.reviewNotes || '');

  async function act(status) {
    setBusy(true);
    try {
      const body = { status };
      if (status === 'rejected' && notes) body.reviewNotes = notes;
      await onPatch(row.id, body);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    setBusy(true);
    try {
      await onPatch(row.id, { content });
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-4"
      data-testid="review-card"
    >
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <StatusBadge status={row.status} />
        <TypeChip type={row.type} />
        <span className="text-xs text-gray-500">opportunity #{row.opportunityId}</span>
        <span className="text-xs text-gray-400">
          · {new Date(row.createdAt).toLocaleString()}
        </span>
        {row.aiModel && (
          <span className="text-xs text-gray-400">· {row.aiModel}</span>
        )}
      </div>

      {editing ? (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={Math.min(20, Math.max(8, content.split('\n').length))}
          className="w-full text-sm font-mono p-3 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
          data-testid="review-edit-textarea"
        />
      ) : (
        <div
          className="review-prose text-sm text-gray-800 dark:text-gray-200 max-h-[32rem] overflow-y-auto"
          data-testid="review-content"
          dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(row.content) }}
        />
      )}

      {row.reviewNotes && row.status === 'rejected' && (
        <p className="mt-2 text-xs text-red-700 dark:text-red-300">
          Reject reason: {row.reviewNotes}
        </p>
      )}

      {row.status === 'draft' && (
        <div className="mt-3 flex flex-wrap items-center gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
          {!editing && (
            <button
              type="button"
              disabled={busy}
              onClick={() => act('approved')}
              className="px-3 py-1.5 rounded bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50"
              data-testid="approve-btn"
            >
              ✅ Approve
            </button>
          )}
          {!editing && (
            <button
              type="button"
              disabled={busy}
              onClick={() => act('rejected')}
              className="px-3 py-1.5 rounded bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-50"
              data-testid="reject-btn"
            >
              ✖ Reject
            </button>
          )}
          {!editing ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(true)}
              className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              data-testid="edit-btn"
            >
              ✏️ Edit
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={saveEdit}
                className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => { setContent(row.content); setEditing(false); }}
                className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-sm"
              >
                Cancel
              </button>
            </>
          )}
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Reject reason (optional)"
            className="ml-auto border border-gray-300 dark:border-gray-600 dark:bg-gray-800 rounded px-2 py-1 text-sm w-64"
          />
        </div>
      )}
    </article>
  );
}

function ReviewQueuePage() {
  const { user } = useSelector((s) => s.auth);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [statusFilter, setStatusFilter] = useState('draft');

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const params = { limit: 100 };
      if (statusFilter) params.status = statusFilter;
      const res = await listOutputs(params);
      setRows(res.data || []);
      setTotal(res.pagination?.total ?? (res.data || []).length);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function handlePatch(id, body) {
    const updated = await patchOutputStatus(id, body);
    setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
  }

  if (!user || user.role !== 'admin') {
    return <div className="p-6 text-center text-gray-500">Admin access required.</div>;
  }

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto">
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            📋 Review Queue
            <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 font-medium">
              OIED
            </span>
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            AI-generated proposals, offers, and analyses awaiting review.
          </p>
        </header>

        <div className="flex items-center gap-3 mb-4 text-sm">
          <label className="flex items-center gap-1.5">
            Status:
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 dark:bg-gray-800 rounded px-2 py-1"
              data-testid="review-status-filter"
            >
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <span className="text-gray-500">{total} item{total === 1 ? '' : 's'}</span>
        </div>

        {err && <div className="p-3 rounded bg-red-50 text-sm text-red-700 mb-3">{err}</div>}

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-gray-500 bg-white dark:bg-gray-800 border rounded" data-testid="review-empty">
            No outputs in this status.
          </div>
        ) : (
          <div data-testid="review-list">
            {rows.map((r) => <OutputCard key={r.id} row={r} onPatch={handlePatch} />)}
          </div>
        )}
      </div>
    </div>
  );
}

export default ReviewQueuePage;
