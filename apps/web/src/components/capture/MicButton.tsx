/**
 * Кнопка микрофона: кольцо уровня звука (.mic__level, --level 0..1) внутри .mic и пульс первого запуска.
 * Стили — capture/mic.css. По FOCUS_MIC_EVENT фокусируется только видимый экземпляр (hero или мобильный док).
 */
import { useRef, type CSSProperties } from 'react';
import { FOCUS_MIC_EVENT, useWindowEvent } from '../../lib/events';
import { Icon } from '../Icon';
import type { Capture } from './useCapture';
import './mic.css';

export function MicButton({
  capture,
  first,
  className = '',
}: {
  capture: Pick<Capture, 'rec' | 'recording' | 'busy' | 'toggle'>;
  first?: boolean;
  className?: string;
}) {
  const { rec, recording, busy, toggle } = capture;
  const buttonRef = useRef<HTMLButtonElement>(null);

  useWindowEvent(FOCUS_MIC_EVENT, () => {
    const b = buttonRef.current;
    if (!b || b.offsetParent === null) return; // скрытый экземпляр
    b.scrollIntoView({ block: 'center', behavior: 'smooth' });
    b.focus({ preventScroll: true });
  });

  return (
    <div
      className={`mic ${className}`}
      data-recording={recording || undefined}
      data-first={(first && !recording) || undefined}
      style={{ '--level': rec.level } as CSSProperties}
    >
      <span className="mic__level" aria-hidden="true" />
      <button
        ref={buttonRef}
        type="button"
        className="mic__btn"
        onClick={toggle}
        disabled={rec.state === 'unsupported' || busy}
        aria-pressed={recording}
        aria-label={recording ? 'Остановить запись' : 'Начать запись'}
      >
        <Icon name={recording ? 'stop' : 'mic'} />
      </button>
    </div>
  );
}
