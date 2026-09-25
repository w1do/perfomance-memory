/** Глобальные события интерфейса (window CustomEvent) и хук подписки на них. */
import { useEffect, useRef } from 'react';

/** Фокус на микрофон (hero или мобильный док). */
export const FOCUS_MIC_EVENT = 'pm:focus-mic';
/** Раскрыть инструкцию MCP и прокрутить к ней. */
export const MCP_OPEN_EVENT = 'pm:mcp-open';

export function emit(name: string, detail?: unknown): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/** Подписка на событие window; обработчик всегда актуальный, переподписки нет. */
export function useWindowEvent(name: string, handler: (e: Event) => void): void {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const listener = (e: Event) => ref.current(e);
    window.addEventListener(name, listener);
    return () => window.removeEventListener(name, listener);
  }, [name]);
}
