import { useMemo } from 'react';

const PALETTE = [
  '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4',
];

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface Props {
  name: string;
  size?: number;
  className?: string;
}

export function AvatarInitials({ name, size = 36, className = '' }: Props) {
  const bg = useMemo(() => PALETTE[hashCode(name) % PALETTE.length], [name]);
  const letters = useMemo(() => initials(name), [name]);
  const fontSize = Math.round(size * 0.4);

  return (
    <div
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-white font-semibold select-none ${className}`}
      style={{ width: size, height: size, backgroundColor: bg, fontSize }}
      title={name}
    >
      {letters}
    </div>
  );
}
