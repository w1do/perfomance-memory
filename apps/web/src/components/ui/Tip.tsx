/**
 * Всплывающая подсказка: hover (задержка 300ms) и фокус; Esc, blur и уход курсора скрывают.
 * Пузырь .tip (components.css, тёмный ink-2) рендерится порталом в body и ставится position: fixed.
 */
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type RefCallback,
} from 'react';
import { createPortal } from 'react-dom';

export type TipTriggerProps = {
  ref: RefCallback<HTMLElement>;
  tabIndex: 0;
  'aria-describedby': string;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (e: KeyboardEvent) => void;
};

const GAP = 8;
const EDGE = 8;

export function Tip({
  content,
  children,
  placement = 'top',
}: {
  content: ReactNode;
  placement?: 'top' | 'bottom';
  children: (t: TipTriggerProps) => ReactNode;
}): ReactElement {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const bubble = useRef<HTMLDivElement | null>(null);
  const timer = useRef(0);

  const place = useCallback(() => {
    const t = trigger.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const w = bubble.current?.offsetWidth ?? 0;
    const h = bubble.current?.offsetHeight ?? 0;
    const below = placement === 'bottom' ? r.bottom + GAP + h <= innerHeight : r.top - GAP - h < 0;
    const half = w / 2;
    const x = Math.min(Math.max(r.left + r.width / 2, half + EDGE), innerWidth - half - EDGE);
    setPos({ x, y: below ? r.bottom + GAP : r.top - GAP, below });
  }, [placement]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener('scroll', place, { passive: true, capture: true });
    window.addEventListener('resize', place, { passive: true });
    return () => {
      window.removeEventListener('scroll', place, { capture: true });
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const show = useCallback((delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), delay);
  }, []);
  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setOpen(false);
    setPos(null);
  }, []);

  const props: TipTriggerProps = {
    ref: (el) => {
      trigger.current = el;
    },
    tabIndex: 0,
    'aria-describedby': id,
    onPointerEnter: () => show(300),
    onPointerLeave: hide,
    onFocus: () => show(0),
    onBlur: hide,
    onKeyDown: (e) => {
      if (e.key === 'Escape' && open) {
        e.stopPropagation();
        hide();
      }
    },
  };

  return (
    <>
      {children(props)}
      {open &&
        createPortal(
          <div
            ref={bubble}
            role="tooltip"
            id={id}
            className="tip"
            data-side={pos?.below ? 'bottom' : 'top'}
            style={{
              left: pos?.x ?? 0,
              top: pos?.y ?? 0,
              visibility: pos ? 'visible' : 'hidden',
              transform: pos?.below ? 'translateX(-50%)' : 'translate(-50%, -100%)',
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
