import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import publicOpportunityService from '../services/publicOpportunityService';
import OpportunityFilters from '../components/opportunities/OpportunityFilters';
import OpportunityList from '../components/opportunities/OpportunityList';
import SEOHead from '../components/common/SEOHead';

function PublicBrowsePage() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({});

  const fetchOpportunities = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const response = await publicOpportunityService.list(params);
      setItems(response.data.data.results || []);
      setPagination(response.data.pagination || null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load opportunities');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const response = await publicOpportunityService.getStats();
      setStats(response.data.data.stats || null);
    } catch {
      // Stats are non-critical
    }
  }, []);

  useEffect(() => {
    fetchOpportunities({ page: 1, limit: 20 });
    fetchStats();
  }, [fetchOpportunities, fetchStats]);

  const handleFilterChange = useCallback((newFilters) => {
    setFilters(newFilters);
    fetchOpportunities({ ...newFilters, page: 1, limit: 20 });
  }, [fetchOpportunities]);

  const handlePageChange = (newPage) => {
    fetchOpportunities({ ...filters, page: newPage, limit: 20 });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <SEOHead title="Browse Opportunities" description="Browse AI-scored government contracts, AI jobs, and investment opportunities. No account required." path="/browse" />
      {/* Minimal Public Header */}
      <header className="bg-primary text-white shadow-md sticky top-0 z-30">
        <div className="flex items-center justify-between px-4 h-14 max-w-6xl mx-auto">
          <span className="text-lg font-bold tracking-wide">Opportunity Pulse</span>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm text-gray-300 hover:text-white transition"
            >
              Sign In
            </Link>
            <Link
              to="/register"
              className="text-sm px-3 py-1.5 rounded bg-accent hover:bg-blue-700 transition"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </header>

      <div className="p-6">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold text-primary mb-2">
            Browse Opportunities
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Explore government contracts, AI jobs, and investment opportunities.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-gray-700 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Quick Stats */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-primary">
                  {stats.total ?? 0}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Total Active</div>
              </div>
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {stats.gov_contract ?? 0}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Gov Contracts</div>
              </div>
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {stats.ai_job ?? 0}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">AI Jobs</div>
              </div>
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-green-600">
                  {stats.investment ?? 0}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Investments</div>
              </div>
            </div>
          )}

          <div className="space-y-6">
            <OpportunityFilters
              onFilterChange={handleFilterChange}
              filters={{}}
              isPublic
            />
            <OpportunityList
              items={items}
              pagination={pagination}
              onPageChange={handlePageChange}
              loading={loading}
              isPublic
            />
          </div>

          {/* CTA Banner */}
          <div className="mt-8 bg-accent text-white rounded-lg p-6 text-center">
            <h2 className="text-xl font-bold mb-2">
              Get Full Access with AI-Powered Insights
            </h2>
            <p className="text-blue-100 mb-4">
              Create a free account to see AI scores, trend analysis, and personalized alerts.
            </p>
            <Link
              to="/register"
              className="inline-block px-6 py-2.5 bg-white text-accent font-semibold rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition"
            >
              Create Free Account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PublicBrowsePage;
