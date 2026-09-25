/**
 * Модальное окно: портал в body (z --z-modal), затемнение --backdrop с blur(6px) и .veil-in, панель — Card opaque
 * с blur-in; окно по центру, содержимое прокручивается, кнопки `footer` закреплены внизу. Esc, фокус, html[data-modal].
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Icon3DName } from '../lib/assets';
import type { Tone } from '../lib/roles';
import { Icon } from './Icon';
import { Card } from './ui/Card';

const WIDTH = { md: 'max-w-modal', lg: 'md:max-w-[min(880px,100%_-_36px)]' } as const;

export function Modal({
  title,
  eyebrow,
  onClose,
  children,
  footer,
  size = 'md',
  icon3d,
  tone,
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  /** кнопки действий, закреплённые внизу (видны, пока прокручивается содержимое) */
  footer?: ReactNode;
  size?: 'md' | 'lg';
  icon3d?: Icon3DName;
  tone?: Tone;
}) {
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root.dataset.modal = 'open';
    panel.current?.focus({ preventScroll: true });
    return () => {
      delete root.dataset.modal;
      prev?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-sm">
      <div
        className="veil-in absolute inset-0 bg-[var(--backdrop)] backdrop-blur-[6px]"
        aria-hidden="true"
        onMouseDown={onClose}
      />
      <Card
        as="div"
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        variant="opaque"
        tone={tone}
        icon3d={icon3d}
        icon3dSize="sm"
        reveal={false}
        lift={false}
        className={`blur-in flex max-h-[calc(100dvh-2*var(--space-sm))] w-full flex-col shadow-lg outline-none before:hidden ${WIDTH[size]}`}
      >
        <div className="card-head mb-md flex shrink-0 items-start gap-3 pe-[calc(var(--s3d,0px)*0.75)]">
          <div className="min-w-0 flex-1">
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            <h2 id={titleId} className="text-h3 break-words">
              {title}
            </h2>
          </div>
          <button className="btn-icon -mt-1 -mr-2 shrink-0" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" />
          </button>
        </div>
        <div className="-mx-md min-h-0 flex-1 overflow-y-auto px-md pb-1">{children}</div>
        {footer && (
          <div className="mt-md flex shrink-0 flex-wrap gap-2 border-t border-border pt-md">
            {footer}
          </div>
        )}
      </Card>
    </div>,
    document.body,
  );
}
