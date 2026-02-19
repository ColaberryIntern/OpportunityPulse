import React from 'react';
import { useSocket } from '../../hooks/useSocket';

function ConnectionStatus() {
  const { connected } = useSocket();
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-400'}`} />
      <span className={`${connected ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
        {connected ? 'Live' : 'Reconnecting...'}
      </span>
    </div>
  );
}

function LiveUpdateBadge({ lastUpdate }) {
  if (!lastUpdate) return null;
  return (
    <span className="text-xs text-gray-400 dark:text-gray-500">
      Updated {new Date(lastUpdate).toLocaleTimeString()}
    </span>
  );
}

export { ConnectionStatus, LiveUpdateBadge };
