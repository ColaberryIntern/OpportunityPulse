import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import personalMatchService from '../services/personalMatchService';
import MatchCard from '../components/dashboard/MatchCard';
import SEOHead from '../components/common/SEOHead';

function ForYouPage() {
  const navigate = useNavigate();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchMatches = async () => {
    try {
      setError('');
      const response = await personalMatchService.getMatches();
      setMatches(response.data.data.matches || []);
    } catch (err) {
      setError('Failed to load matches.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      setError('');
      const response = await personalMatchService.refreshMatches();
      setMatches(response.data.data.matches || []);
    } catch (err) {
      setError('Failed to refresh. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMatches();
  }, []);

  return (
    <div className="p-6">
      <SEOHead title="For You" path="/for-you" />
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-primary dark:text-white">For You</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              AI-matched opportunities based on your profile, skills, and behavior
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-4 py-2 text-sm font-medium text-white bg-accent rounded-md hover:bg-accent/90 disabled:opacity-50 transition"
            >
              {refreshing ? 'Refreshing...' : 'Refresh Matches'}
            </button>
            <button
              onClick={() => navigate('/profile')}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition"
            >
              Edit Profile
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
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
        ) : matches.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center">
            <svg className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">No Matches Yet</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Complete your AI profile so we can match you with the best opportunities.
            </p>
            <button
              onClick={() => navigate('/profile')}
              className="px-6 py-2 text-sm font-medium text-white bg-accent rounded-md hover:bg-accent/90 transition"
            >
              Set Up AI Profile
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {matches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ForYouPage;
