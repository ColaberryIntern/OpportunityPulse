import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import personalMatchService from '../../services/personalMatchService';
import MatchCard from './MatchCard';

function ForYouSection() {
  const navigate = useNavigate();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [fromCache, setFromCache] = useState(false);

  const fetchMatches = async () => {
    try {
      setError('');
      const response = await personalMatchService.getMatches();
      const data = response.data.data;
      setMatches(data.matches || []);
      setFromCache(data.fromCache || false);
    } catch (err) {
      // Don't show error for empty profile — just show empty state
      if (err.response?.status !== 500) {
        setError('');
      } else {
        setError('Failed to load matches.');
      }
      setMatches([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      setError('');
      const response = await personalMatchService.refreshMatches();
      const data = response.data.data;
      setMatches(data.matches || []);
      setFromCache(false);
    } catch (err) {
      setError('Failed to refresh matches. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMatches();
  }, []);

  if (loading) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
          For You — AI Matches
        </h2>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 animate-pulse">
              <div className="flex justify-between">
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full" />
                </div>
                <div className="w-14 h-14 bg-gray-200 dark:bg-gray-700 rounded-lg ml-3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          For You — AI Matches
        </h2>
        <div className="flex items-center gap-2">
          {fromCache && (
            <span className="text-xs text-gray-400 dark:text-gray-500">Cached</span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-3 py-1 text-xs font-medium text-accent bg-accent/10 rounded-md hover:bg-accent/20 disabled:opacity-50 transition"
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            onClick={() => navigate('/for-you')}
            className="px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition"
          >
            View All
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {matches.length === 0 && !error ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 text-center">
          <svg className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
            Complete Your AI Profile
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Tell us about your skills, industry, and goals so our AI can match you with the best opportunities.
          </p>
          <button
            onClick={() => navigate('/profile')}
            className="px-4 py-2 text-sm font-medium text-white bg-accent rounded-md hover:bg-accent/90 transition"
          >
            Set Up AI Profile
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {matches.slice(0, 5).map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
          {matches.length > 5 && (
            <button
              onClick={() => navigate('/for-you')}
              className="w-full py-2 text-sm text-center text-accent hover:text-accent/80 transition"
            >
              View all {matches.length} matches
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default ForYouSection;
