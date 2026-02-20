import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import freelanceService from '../../services/freelanceService';

function formatBudget(value) {
  if (!value || value === 0) return '-';
  const num = parseFloat(value);
  if (num >= 1000) return `$${(num / 1000).toFixed(num >= 10000 ? 0 : 1)}K`;
  return `$${Math.round(num).toLocaleString()}`;
}

function FreelanceSkillsDemand() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    freelanceService.getTrends()
      .then((res) => {
        if (!cancelled) setData(res.data?.data || res.data || null);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-5 animate-pulse">
        <div className="h-5 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3 mb-3">
            <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-2 flex-1 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        ))}
      </div>
    );
  }

  const trending = data?.trending || [];
  if (trending.length === 0) return null;

  const maxDemand = Math.max(...trending.map((t) => t.demandCount || 0), 1);

  // Compute averages from trending data
  const totalBudget = trending.reduce((sum, t) => sum + (parseFloat(t.avgBudget) || 0), 0);
  const totalProposals = trending.reduce((sum, t) => sum + (parseFloat(t.avgProposals) || 0), 0);
  const avgBudget = trending.length > 0 ? totalBudget / trending.length : 0;
  const avgProposals = trending.length > 0 ? Math.round(totalProposals / trending.length) : 0;

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Freelance Skills Demand
        </h2>
        <Link
          to="/freelance"
          className="text-xs text-accent hover:underline font-medium"
        >
          View All &rarr;
        </Link>
      </div>

      <div className="space-y-2.5">
        {trending.slice(0, 8).map((skill) => {
          const pct = ((skill.demandCount || 0) / maxDemand) * 100;
          const growth = parseFloat(skill.growthRate) || 0;
          const isGrowing = growth > 0;

          return (
            <div key={skill.skill} className="flex items-center gap-3">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300 w-28 truncate" title={skill.skill}>
                {skill.skill}
              </span>
              <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent/70"
                  style={{ width: `${Math.max(pct, 3)}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-500 dark:text-gray-400 w-16 text-right">
                {skill.demandCount || 0} proj
              </span>
              <span className={`text-[10px] font-medium w-12 text-right ${isGrowing ? 'text-green-600' : growth < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                {isGrowing ? '\u2191' : growth < 0 ? '\u2193' : ''}{Math.abs(growth).toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>

      {/* Summary row */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
        <span>Avg Budget: <strong className="text-gray-700 dark:text-gray-300">{formatBudget(avgBudget)}</strong></span>
        <span>Avg Proposals: <strong className="text-gray-700 dark:text-gray-300">{avgProposals}</strong></span>
      </div>
    </div>
  );
}

export default FreelanceSkillsDemand;
