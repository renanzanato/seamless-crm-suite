/**
 * Deterministic avatar initials with consistent color per name.
 * Like HubSpot's colored avatar circles — makes lists scannable.
 */

const PALETTE = [
  'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400',
  'bg-lime-500/15 text-lime-600 dark:text-lime-400',
  'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  'bg-teal-500/15 text-teal-600 dark:text-teal-400',
];

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

interface AvatarInitialsProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-14 w-14 text-lg',
};

export function AvatarInitials({ name, size = 'md', className = '' }: AvatarInitialsProps) {
  const color = PALETTE[hashCode(name) % PALETTE.length];
  const initials = getInitials(name);

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${SIZES[size]} ${color} ${className}`}
      title={name}
    >
      {initials}
    </div>
  );
}
