/**
 * Декоративная объёмная иконка склада (decor/cta-icons/extrude) как маска: лицо, торец и тень
 * красятся градиентом роли (--r из data-role ближайшего предка или prop tone). Стили — icon3d.css.
 */
import type { CSSProperties } from 'react';
import { icon3dUrl, type Icon3DName } from '../../lib/assets';
import type { Tone } from '../../lib/roles';

export type Icon3DSize = 'emblem' | 'sm' | 'md' | 'lg';
export type Icon3DPlacement = 'corner' | 'free' | 'inline' | 'center';

export function Icon3D({
  name,
  size,
  placement = 'corner',
  tone,
  float,
  className = '',
}: {
  name: Icon3DName;
  size?: Icon3DSize;
  placement?: Icon3DPlacement;
  tone?: Tone;
  float?: boolean;
  className?: string;
}) {
  const url = icon3dUrl(name);
  if (!url) return null;
  return (
    <span
      aria-hidden="true"
      className={`icon3d ${className}`}
      data-placement={placement}
      data-size={size}
      data-role={tone}
      data-float={float || undefined}
      style={{ '--m3d': `url("${url}")` } as CSSProperties}
    >
      <span className="icon3d__paint">
        <i className="icon3d__body" />
        <i className="icon3d__light" />
        <i className="icon3d__grid" />
      </span>
    </span>
  );
}
