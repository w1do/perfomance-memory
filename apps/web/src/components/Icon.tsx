import type { CSSProperties } from 'react';
import { iconUrl, type IconName } from '../lib/assets';

/** Warehouse icon as a CSS mask coloured with currentColor. Missing asset → empty slot. */
export function Icon({
  name,
  className = '',
  label,
}: {
  name: IconName;
  className?: string;
  label?: string;
}) {
  const url = iconUrl(name);
  if (!url)
    return (
      <span className={`icon-slot ${className}`} aria-hidden="true" data-missing-icon={name} />
    );
  return (
    <span
      className={`icon ${className}`}
      style={{ '--icon': `url("${url}")` } as CSSProperties}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
