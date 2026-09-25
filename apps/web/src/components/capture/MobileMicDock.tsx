/**
 * Мобильный док микрофона (<768): портал в body (fixed внутри карточки не работает), таймер · микрофон · шаг.
 * Прячется при открытой модалке и экранной клавиатуре (стили — mic.css); пузырь «Нажмите и говорите» до первой записи.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePref, writePref } from '../../lib/prefs';
import { MicButton } from './MicButton';
import { mmss, STEPS, type Capture } from './useCapture';

function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => setOpen(vv.height < 0.75 * window.innerHeight);
    vv.addEventListener('resize', sync);
    sync();
    return () => vv.removeEventListener('resize', sync);
  }, []);
  return open;
}

export function MobileMicDock({ capture, first }: { capture: Capture; first?: boolean }) {
  const keyboard = useKeyboardOpen();
  const bubbleSeen = usePref('pm.dock.bubble') === '1';
  const { recording, activeStep, rec } = capture;

  useEffect(() => {
    if (recording && !bubbleSeen) writePref('pm.dock.bubble', '1');
  }, [recording, bubbleSeen]);

  return createPortal(
    <div
      className="mic-dock"
      data-keyboard={keyboard || undefined}
      role="region"
      aria-label="Запись голосом"
    >
      <span className="mono text-lead text-text tabular-nums" aria-live="polite">
        {mmss(rec.seconds)}
      </span>
      <div className="relative">
        {!bubbleSeen && !recording && (
          <span className="dock-bubble" aria-hidden="true">
            Нажмите и говорите
          </span>
        )}
        <MicButton capture={capture} first={first} />
      </div>
      <span className="text-right text-caption font-medium text-text-2">
        {activeStep === null ? 'Готов' : STEPS[activeStep]}
      </span>
    </div>,
    document.body,
  );
}
