/**
 * Карточка bento (card.css): вариант поверхности, краска роли (data-role), 3D-иконка в углу,
 * акцент (постоянный border-run — только hero), sheen, очередь появления --i (reveal-sequence frost-01).
 */
import { forwardRef, type CSSProperties, type ElementType, type HTMLAttributes } from 'react';
import type { ReactNode } from 'react';
import type { Icon3DName } from '../../lib/assets';
import type { Tone } from '../../lib/roles';
import { Icon3D } from '../fx/Icon3D';

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: 'section' | 'article' | 'aside' | 'div' | 'form';
  /** по умолчанию solid */
  variant?: 'solid' | 'glass' | 'deep' | 'opaque';
  /** постоянный border-run + glow — ТОЛЬКО hero */
  accent?: boolean;
  /** краска роли → data-role (не `role`: это ARIA-атрибут) */
  tone?: Tone;
  icon3d?: Icon3DName;
  /** по умолчанию md */
  icon3dSize?: 'sm' | 'md' | 'lg';
  /** idle float 3D — только hero и PREFERENCES.md */
  float?: boolean;
  /** idle sheen — только PREFERENCES.md */
  sheen?: boolean;
  /** дополнительные декоративные слои внутри .card__deco */
  deco?: ReactNode;
  /** --i для очереди появления */
  index?: number;
  /** класс .enter, по умолчанию true */
  reveal?: boolean;
  /** подъём на hover, по умолчанию !accent */
  lift?: boolean;
};

export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  {
    as = 'section',
    variant = 'solid',
    accent = false,
    tone,
    icon3d,
    icon3dSize = 'md',
    float,
    sheen,
    deco,
    index,
    reveal = true,
    lift,
    className = '',
    style,
    children,
    ...rest
  },
  ref,
) {
  const Tag = as as ElementType;
  const cls = [
    'card',
    variant !== 'solid' && `card--${variant}`,
    accent && 'card--accent',
    reveal && 'enter',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const hasDeco = Boolean(deco || sheen || icon3d);
  const vars = index === undefined ? style : ({ ...style, '--i': index } as CSSProperties);
  return (
    <Tag
      ref={ref}
      className={cls}
      data-role={tone}
      data-3d={icon3d ? icon3dSize : undefined}
      data-lift={(lift ?? !accent) ? '' : undefined}
      data-parallax={icon3d || deco ? '' : undefined}
      style={vars}
      {...rest}
    >
      {hasDeco && (
        <span className="card__deco" aria-hidden="true">
          {deco}
          {sheen && <span className="sheen-band" />}
          {icon3d && <Icon3D name={icon3d} placement="corner" float={float} />}
        </span>
      )}
      {children}
    </Tag>
  );
});
