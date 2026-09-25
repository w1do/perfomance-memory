import type { CSSProperties, HTMLAttributes } from 'react';
import { illustrationSvg } from '../lib/assets';

/**
 * Inline warehouse illustration (local trusted file); colours come from tokens via CSS.
 * Extra attributes (data-depth, style with --illustration-bg) pass through to the wrapper.
 */
export function Illustration({
  name,
  className = '',
  label,
  style,
  ...rest
}: Omit<HTMLAttributes<HTMLDivElement>, 'style'> & {
  name: 'hero' | 'empty';
  className?: string;
  label?: string;
  style?: CSSProperties & Record<`--${string}`, string | number>;
  'data-depth'?: 'sm' | 'md';
}) {
  const svg = illustrationSvg(name);
  if (!svg) return null;
  return (
    <div
      {...rest}
      className={`illustration ${className}`}
      style={style}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
