/**
 * Тосты: контейнер порталом в body (z --z-toast), чтобы не попасть под модалку и containing block карточек.
 * Полоса слева --toast-c: success — role-service, error — danger, info — role-ui; появление .enter (fade-up).
 */
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

type Kind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: Kind;
  text: string;
}

const STRIPE: Record<Kind, string> = {
  success: 'var(--role-service)',
  error: 'var(--color-danger)',
  info: 'var(--role-ui)',
};

const Ctx = createContext<(text: string, kind?: Kind) => void>(() => undefined);

export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Kind = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      {createPortal(
        <div
          className="fixed right-4 bottom-[calc(112px+env(safe-area-inset-bottom))] left-4 z-[var(--z-toast)] ml-auto flex max-w-toast flex-col gap-2 md:bottom-6 md:left-auto"
          role="status"
          aria-live="polite"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className="enter flex items-start gap-3 rounded-card border border-border bg-[color-mix(in_srgb,var(--color-surface)_96%,transparent)] py-3 pr-3 pl-4 text-body text-text shadow-[inset_3px_0_0_var(--toast-c),var(--shadow-md)]"
              style={{ '--toast-c': STRIPE[t.kind] } as CSSProperties}
            >
              {t.kind === 'success' && <Icon name="check" className="mt-1 text-service-ink" />}
              <span className="min-w-0 flex-1">{t.text}</span>
              <button
                className="btn-icon -my-1 h-7 w-7 shrink-0"
                onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
                aria-label="Закрыть"
              >
                <Icon name="close" className="text-caption" />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  );
}
