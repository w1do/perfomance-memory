/**
 * Фоновое движение (frost-01 decor_motion/parallax): пауза всех анимаций на скрытой вкладке
 * (html[data-idle="paused"]) и параллакс — один делегированный pointermove с rAF, пишет --px/--py
 * в ближайший [data-parallax]. Только при (pointer: fine) и без reduced motion.
 */
import { useEffect } from 'react';

const QUERY = '(pointer: fine) and (prefers-reduced-motion: no-preference)';
const clamp = (n: number) => Math.max(-1, Math.min(1, n));

export function useAmbientMotion(): void {
  useEffect(() => {
    const root = document.documentElement;
    const onVisibility = () => {
      if (document.hidden) root.dataset.idle = 'paused';
      else delete root.dataset.idle;
    };
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();

    let current: HTMLElement | null = null;
    let last: PointerEvent | null = null;
    let raf = 0;
    const reset = () => {
      current?.style.removeProperty('--px');
      current?.style.removeProperty('--py');
      current = null;
    };
    const frame = () => {
      raf = 0;
      const e = last;
      if (!e) return;
      const el =
        e.target instanceof Element ? e.target.closest<HTMLElement>('[data-parallax]') : null;
      if (el !== current) reset();
      if (!el) return;
      current = el;
      const r = el.getBoundingClientRect();
      const px = clamp(((e.clientX - r.left) / r.width) * 2 - 1);
      const py = clamp(((e.clientY - r.top) / r.height) * 2 - 1);
      el.style.setProperty('--px', px.toFixed(3));
      el.style.setProperty('--py', py.toFixed(3));
    };
    const onMove = (e: PointerEvent) => {
      last = e;
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onLeave = () => {
      last = null;
      reset();
    };

    const mq = window.matchMedia(QUERY);
    let enabled = false;
    const sync = () => {
      if (mq.matches === enabled) return;
      enabled = mq.matches;
      if (enabled) {
        document.addEventListener('pointermove', onMove, { passive: true });
        root.addEventListener('pointerleave', onLeave);
      } else {
        document.removeEventListener('pointermove', onMove);
        root.removeEventListener('pointerleave', onLeave);
        onLeave();
      }
    };
    mq.addEventListener('change', sync);
    sync();

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      mq.removeEventListener('change', sync);
      document.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(raf);
      onLeave();
      delete root.dataset.idle;
    };
  }, []);
}
