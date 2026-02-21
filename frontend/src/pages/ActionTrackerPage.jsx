import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { fetchActions, fetchAnalytics, updateAction, deleteActionThunk } from '../store/slices/actionEngineSlice';
import SEOHead from '../components/common/SEOHead';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';

/* ── Colour & label maps ── */

const ACTION_TYPE_COLORS = {
  BUILD: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300',
  BID: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  APPLY: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300',
  PARTNER: 'bg-violet-100 dark:bg-violet-900/30 text-violet-800 dark:text-violet-300',
  INVEST: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
  TEACH: 'bg-rose-100 dark:bg-rose-900/30 text-rose-800 dark:text-rose-300',
};

const ACTION_TYPE_EMOJIS = {
  BUILD: '\u{1F528}', BID: '\u{1F4CB}', APPLY: '\u2705',
  PARTNER: '\u{1F91D}', INVEST: '\u{1F4B0}', TEACH: '\u{1F4DA}',
};

const STATUS_COLORS = {
  planned: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  in_progress: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  executed: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  abandoned: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
};

const STATUS_LABELS = {
  planned: 'Planned', in_progress: 'In Progress', executed: 'Executed', abandoned: 'Abandoned',
};

const OPP_TYPE_EMOJIS = {
  gov_contract: '\u{1F3DB}\uFE0F', ai_job: '\u{1F916}', investment: '\u{1F4B0}',
  grant: '\u{1F393}', ai_news: '\u{1F4F0}', freelance: '\u{1F4BC}',
};

const OPP_TYPE_LABELS = {
  gov_contract: 'Gov Contract', ai_job: 'AI Job', investment: 'Investment',
  grant: 'Grant', ai_news: 'AI News', freelance: 'Freelance',
};

const OPP_TYPE_COLORS = {
  gov_contract: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  ai_job: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300',
  investment: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  grant: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
  ai_news: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-800 dark:text-cyan-300',
  freelance: 'bg-teal-100 dark:bg-teal-900/30 text-teal-800 dark:text-teal-300',
};

const PIE_COLORS = {
  BUILD: '#6366F1', BID: '#3B82F6', APPLY: '#10B981',
  PARTNER: '#8B5CF6', INVEST: '#F59E0B', TEACH: '#F43F5E',
};

const FUNNEL_COLORS = {
  planned: '#3B82F6', in_progress: '#F59E0B', executed: '#10B981', abandoned: '#6B7280',
};

const QUADRANT_SHORT = {
  'High Demand / Low Competition': { label: 'HD / LC', color: 'text-green-600 dark:text-green-400' },
  'High Demand / High Competition': { label: 'HD / HC', color: 'text-yellow-600 dark:text-yellow-400' },
  'Low Demand / Low Competition': { label: 'LD / LC', color: 'text-gray-500 dark:text-gray-400' },
  'Low Demand / High Competition': { label: 'LD / HC', color: 'text-red-500 dark:text-red-400' },
};

/* ── Helpers ── */

function getScoreColor(score) {
  if (score >= 80) return 'text-green-600 dark:text-green-400';
  if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-gray-500 dark:text-gray-400';
}

function formatCompact(n) {
  if (!n) return '$0';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Number(n).toLocaleString()}`;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
}

/* ── Sub-components ── */

function KPICard({ emoji, label, value, subtext, accentColor, loading }) {
  return (
    <div className={`bg-white dark:bg-gray-800 shadow rounded-lg p-4 border-l-4 ${accentColor}`}>
      {loading ? (
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-20" />
      ) : (
        <div className="flex items-start gap-3">
          <span className="text-2xl">{emoji}</span>
          <div>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{value ?? '-'}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
            {subtext && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{subtext}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function ActionFunnelChart({ byStatus }) {
  const data = ['planned', 'in_progress', 'executed', 'abandoned'].map((status) => {
    const item = byStatus?.find((s) => s.status === status);
    return { name: STATUS_LABELS[status], count: item?.count || 0, fill: FUNNEL_COLORS[status] };
  });

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Action Funnel</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '0.5rem', fontSize: '12px', color: '#F3F4F6' }}
          />
          <Bar dataKey="count" name="Actions" radius={[4, 4, 0, 0]}>
            {data.map((entry, idx) => (
              <Cell key={idx} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ActionTypeBreakdownChart({ byActionType }) {
  if (!byActionType || byActionType.length === 0) return null;

  const data = byActionType.map((item) => ({
    name: item.actionType,
    value: item.count,
    revenue: item.revenue || 0,
  }));

  const renderLabel = ({ name, value, cx, cy, midAngle, outerRadius }) => {
    const RADIAN = Math.PI / 180;
    const radius = outerRadius + 22;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="#9CA3AF" fontSize={11} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central">
        {ACTION_TYPE_EMOJIS[name] || ''} {name} ({value})
      </text>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Action Type Breakdown</h3>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
            label={renderLabel}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={PIE_COLORS[entry.name] || '#6B7280'} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '0.5rem', fontSize: '12px', color: '#F3F4F6' }}
            formatter={(value, name, props) => [
              `${value} actions (${formatCompact(props.payload.revenue)} revenue)`,
              `${ACTION_TYPE_EMOJIS[name] || ''} ${name}`,
            ]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function FilterBar({ statusFilter, setStatusFilter, actionTypeFilter, setActionTypeFilter, setPage }) {
  const statuses = [
    { value: '', label: 'All' },
    { value: 'planned', label: 'Planned' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'executed', label: 'Executed' },
    { value: 'abandoned', label: 'Abandoned' },
  ];
  const actionTypes = ['BUILD', 'BID', 'APPLY', 'PARTNER', 'INVEST', 'TEACH'];

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 mb-4">
      <div className="space-y-3">
        <div>
          <span className="text-xs text-gray-500 dark:text-gray-400 mr-2">Status:</span>
          <div className="inline-flex flex-wrap gap-1.5">
            {statuses.map((s) => (
              <button
                key={s.value}
                onClick={() => { setStatusFilter(s.value); setPage(1); }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  statusFilter === s.value
                    ? 'bg-accent text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="text-xs text-gray-500 dark:text-gray-400 mr-2">Type:</span>
          <div className="inline-flex flex-wrap gap-1.5">
            <button
              onClick={() => { setActionTypeFilter(''); setPage(1); }}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                actionTypeFilter === ''
                  ? 'bg-accent text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              All
            </button>
            {actionTypes.map((type) => (
              <button
                key={type}
                onClick={() => { setActionTypeFilter(type); setPage(1); }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  actionTypeFilter === type
                    ? ACTION_TYPE_COLORS[type]
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {ACTION_TYPE_EMOJIS[type]} {type}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionCard({ action, onStatusChange, onRevenueChange, onDelete }) {
  const opp = action.opportunity;
  const deadline = daysUntil(opp?.expiresAt);
  const deadlineUrgent = deadline !== null && deadline <= 7 && deadline >= 0;
  const deadlineExpired = deadline !== null && deadline < 0;

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 flex flex-col hover:shadow-md transition">
      {/* Badge row */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${ACTION_TYPE_COLORS[action.actionType] || 'bg-gray-100 text-gray-600'}`}>
          {ACTION_TYPE_EMOJIS[action.actionType]} {action.actionType}
        </span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[action.status]}`}>
          {STATUS_LABELS[action.status]}
        </span>
        {opp?.type && (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${OPP_TYPE_COLORS[opp.type] || 'bg-gray-100 text-gray-600'}`}>
            {OPP_TYPE_EMOJIS[opp.type]} {OPP_TYPE_LABELS[opp.type] || opp.type}
          </span>
        )}
      </div>

      {/* Title */}
      <Link
        to={`/opportunities/${opp?.id || action.opportunityId}`}
        className="text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-accent line-clamp-2 mb-2"
      >
        {opp?.title || `Opportunity #${action.opportunityId}`}
      </Link>

      {/* Metadata row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mb-2">
        {opp?.value != null && Number(opp.value) > 0 && (
          <span title="Opportunity Value">{'\u{1F4B0}'} {formatCompact(opp.value)}</span>
        )}
        {opp?.aiScore != null && (
          <span title="AI Score" className={getScoreColor(opp.aiScore)}>
            {'\u{1F3AF}'} {opp.aiScore}/100
          </span>
        )}
        {opp?.opportunityQuadrant && QUADRANT_SHORT[opp.opportunityQuadrant] && (
          <span title={opp.opportunityQuadrant} className={QUADRANT_SHORT[opp.opportunityQuadrant].color}>
            {'\u{1F4CA}'} {QUADRANT_SHORT[opp.opportunityQuadrant].label}
          </span>
        )}
        {opp?.expiresAt && (
          <span
            title={`Expires ${new Date(opp.expiresAt).toLocaleDateString()}`}
            className={deadlineExpired ? 'text-red-500' : deadlineUrgent ? 'text-amber-500' : ''}
          >
            {'\u23F0'} {deadlineExpired ? 'Expired' : deadline === 0 ? 'Today' : `${deadline}d left`}
          </span>
        )}
      </div>

      {/* Notes */}
      {action.notes && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 line-clamp-2">{action.notes}</p>
      )}

      {/* Footer */}
      <div className="mt-auto pt-2 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2">
        <span className="text-xs text-gray-400 dark:text-gray-500">
          Tracked {new Date(action.createdAt).toLocaleDateString()}
        </span>
        <div className="flex items-center gap-2">
          <select
            value={action.status}
            onChange={(e) => onStatusChange(action.id, e.target.value)}
            className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="planned">Planned</option>
            <option value="in_progress">In Progress</option>
            <option value="executed">Executed</option>
            <option value="abandoned">Abandoned</option>
          </select>

          {action.status === 'executed' && (
            <input
              type="number"
              placeholder="Revenue $"
              defaultValue={action.revenueGenerated || ''}
              onBlur={(e) => onRevenueChange(action.id, e.target.value)}
              className="w-24 text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 dark:bg-gray-800 dark:text-gray-100"
            />
          )}

          <button
            onClick={() => onDelete(action.id)}
            className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-1"
            title="Remove"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function Pagination({ current, total, onChange }) {
  if (!total || total <= 1) return null;

  const pages = [];
  const maxVisible = 5;
  if (total <= maxVisible + 2) {
    for (let i = 1; i <= total; i++) pages.push(i);
  } else {
    pages.push(1);
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    if (start > 2) pages.push('...');
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < total - 1) pages.push('...');
    pages.push(total);
  }

  return (
    <div className="flex justify-center items-center gap-1 mt-6">
      <button
        onClick={() => onChange(current - 1)}
        disabled={current === 1}
        className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded disabled:opacity-30 dark:bg-gray-800 dark:text-gray-100"
      >
        Prev
      </button>
      {pages.map((p, idx) =>
        p === '...' ? (
          <span key={`ellipsis-${idx}`} className="px-2 py-1 text-sm text-gray-400">...</span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`px-3 py-1 text-sm rounded ${
              p === current
                ? 'bg-accent text-white'
                : 'border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            {p}
          </button>
        )
      )}
      <button
        onClick={() => onChange(current + 1)}
        disabled={current === total}
        className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded disabled:opacity-30 dark:bg-gray-800 dark:text-gray-100"
      >
        Next
      </button>
    </div>
  );
}

/* ── Main Page ── */

function ActionTrackerPage() {
  const dispatch = useDispatch();
  const { actions, actionsPagination, actionsLoading, analytics, analyticsLoading, error } = useSelector((state) => state.actionEngine);
  const [statusFilter, setStatusFilter] = useState('');
  const [actionTypeFilter, setActionTypeFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    dispatch(fetchActions({ status: statusFilter || undefined, page }));
    dispatch(fetchAnalytics());
  }, [dispatch, statusFilter, page]);

  const handleStatusChange = (actionId, newStatus) => {
    dispatch(updateAction({ id: actionId, status: newStatus }));
  };

  const handleRevenueChange = (actionId, revenue) => {
    if (revenue !== '') {
      dispatch(updateAction({ id: actionId, revenueGenerated: revenue }));
    }
  };

  const handleDelete = (actionId) => {
    if (window.confirm('Remove this tracked action?')) {
      dispatch(deleteActionThunk(actionId));
    }
  };

  const filteredActions = actionTypeFilter
    ? actions.filter((a) => a.actionType === actionTypeFilter)
    : actions;

  return (
    <div className="p-6">
      <SEOHead title="Action Tracker" path="/action-tracker" />
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-primary dark:text-white mb-6">Action Tracker</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <KPICard
            emoji={'\u{1F4E1}'}
            label="Signals Processed"
            value={analytics?.signalsProcessed?.toLocaleString()}
            accentColor="border-blue-500"
            loading={analyticsLoading}
          />
          <KPICard
            emoji={'\u{1F3AF}'}
            label="Actions Tracked"
            value={analytics?.signalsActedOn}
            subtext={`${analytics?.executedCount || 0} executed`}
            accentColor="border-emerald-500"
            loading={analyticsLoading}
          />
          <KPICard
            emoji={'\u{1F4CA}'}
            label="Conversion Rate"
            value={analytics?.conversionRate ? `${analytics.conversionRate}%` : '0%'}
            subtext={analytics?.revenuePerSignal ? `${formatCompact(analytics.revenuePerSignal)}/signal` : null}
            accentColor="border-amber-500"
            loading={analyticsLoading}
          />
          <KPICard
            emoji={'\u{1F4B0}'}
            label="Revenue Influenced"
            value={analytics?.totalRevenue ? formatCompact(analytics.totalRevenue) : '$0'}
            accentColor="border-violet-500"
            loading={analyticsLoading}
          />
        </div>

        {/* Charts Row */}
        {analytics && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <ActionFunnelChart byStatus={analytics.byStatus} />
            <ActionTypeBreakdownChart byActionType={analytics.byActionType} />
          </div>
        )}

        {/* Filters */}
        <FilterBar
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          actionTypeFilter={actionTypeFilter}
          setActionTypeFilter={setActionTypeFilter}
          setPage={setPage}
        />

        {/* Action Cards */}
        {actionsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 animate-pulse">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-2" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : filteredActions.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 text-center">
            <p className="text-gray-500 dark:text-gray-400">
              {actionTypeFilter ? `No ${actionTypeFilter} actions found.` : 'No tracked actions yet.'}
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
              Track opportunities from the <Link to="/opportunities" className="text-accent hover:underline">Opportunities</Link> page.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredActions.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                onStatusChange={handleStatusChange}
                onRevenueChange={handleRevenueChange}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        <Pagination
          current={actionsPagination?.page || 1}
          total={actionsPagination?.totalPages || 1}
          onChange={setPage}
        />
      </div>
    </div>
  );
}

export default ActionTrackerPage;
