// Small colored pill rendered on every opportunity row to make the
// source channel always visible at a glance. The channel descriptor
// comes from context.channel on the API envelope (Phase 1).

import React from 'react';
import { Link } from 'react-router-dom';

// Tailwind class lookup keyed by the channel.color value the backend
// emits. Keep in sync with backend/src/oied/channels.service.js colors.
const COLOR_CLASSES = {
  purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
  orange: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
  blue:   'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  cyan:   'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200',
  gray:   'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  green:  'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  amber:  'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
};

export default function ChannelChip({ channel, linkable = true, className = '' }) {
  if (!channel || !channel.key) return null;
  const cls = COLOR_CLASSES[channel.color] || COLOR_CLASSES.gray;
  const label = `${channel.icon || ''} ${channel.label || channel.key}`.trim();
  const base = `inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${cls} ${className}`;
  if (!linkable) {
    return <span className={base} data-testid={`channel-chip-${channel.key}`}>{label}</span>;
  }
  return (
    <Link
      to={`/admin/opportunities/my?channel=${encodeURIComponent(channel.key)}`}
      className={`${base} hover:opacity-80 transition`}
      data-testid={`channel-chip-${channel.key}`}
      title={`Filter to ${channel.label}`}
    >
      {label}
    </Link>
  );
}
