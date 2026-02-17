import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { dismissUpgradePrompt } from '../../store/slices/uiSlice';

function UpgradePrompt() {
  const dispatch = useDispatch();
  const { upgradeRequired, upgradeMessage } = useSelector((state) => state.ui);

  if (!upgradeRequired) return null;

  return (
    <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <svg className="w-5 h-5 text-yellow-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
        <div>
          <p className="text-sm font-medium text-yellow-800">{upgradeMessage}</p>
          <p className="text-xs text-yellow-600 mt-0.5">
            Upgrade to Premium for AI scores, trend analysis, and advanced insights.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button className="px-3 py-1.5 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700 transition font-medium">
          Upgrade
        </button>
        <button
          onClick={() => dispatch(dismissUpgradePrompt())}
          className="text-yellow-600 hover:text-yellow-800 text-sm"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

export default UpgradePrompt;
