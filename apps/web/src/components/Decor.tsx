import type { CSSProperties } from 'react';
import { decorUrl } from '../lib/assets';

/** Small warehouse shape (decorative, aria-hidden), tinted with a token colour. */
export function Decor({
  name,
  className = '',
}: {
  name: 'decor-1' | 'decor-2';
  className?: string;
}) {
  const url = decorUrl(name);
  if (!url) return null;
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute block bg-current ${className}`}
      style={
        {
          maskImage: `url("${url}")`,
          maskSize: 'contain',
          maskRepeat: 'no-repeat',
          maskPosition: 'center',
        } as CSSProperties
      }
    />
  );
}
