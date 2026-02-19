import React, { useState } from 'react';

function FeedbackForm({ onSubmit, loading }) {
  const [rating, setRating] = useState(0);
  const [type, setType] = useState('platform');
  const [comments, setComments] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (rating === 0) return;
    onSubmit({ score: rating, comments, type });
    setRating(0);
    setType('platform');
    setComments('');
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 shadow rounded-lg p-5">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Submit Feedback</h3>

      {/* Star Rating */}
      <div className="mb-4">
        <label id="feedback-rating-label" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rating</label>
        <div className="flex gap-1" role="radiogroup" aria-labelledby="feedback-rating-label" aria-required="true">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              className="focus:outline-none"
              aria-label={`${star} star${star > 1 ? 's' : ''}`}
              aria-pressed={star === rating}
            >
              <svg
                className={`w-8 h-8 ${star <= rating ? 'text-yellow-400' : 'text-gray-300'}`}
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </button>
          ))}
        </div>
      </div>

      {/* Type Dropdown */}
      <div className="mb-4">
        <label htmlFor="feedback-type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
        <select
          id="feedback-type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="platform">Platform</option>
          <option value="opportunity">Opportunity</option>
          <option value="content">Content</option>
        </select>
      </div>

      {/* Comments */}
      <div className="mb-4">
        <label htmlFor="feedback-comments" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Comments</label>
        <textarea
          id="feedback-comments"
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          rows={4}
          placeholder="Share your feedback..."
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-800 dark:text-gray-100"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || rating === 0}
        className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Submitting...' : 'Submit Feedback'}
      </button>
    </form>
  );
}

export default FeedbackForm;
