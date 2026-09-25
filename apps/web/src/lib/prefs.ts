/**
 * Настройки интерфейса в localStorage. Все обращения в try/catch: без хранилища значения живут
 * в памяти до перезагрузки, интерфейс работает. Запись шлёт событие 'pm:prefs'.
 */
import { useSyncExternalStore } from 'react';

export type PrefKey =
  | 'pm.hints.hidden'
  | 'pm.mcp.tab'
  | 'pm.mcp.open'
  | 'pm.mcp.copied'
  | 'pm.visited.folders'
  | 'pm.dock.bubble';

export const PREFS_EVENT = 'pm:prefs';
const memory = new Map<PrefKey, string | null>();

export function readPref(k: PrefKey): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return memory.get(k) ?? null;
  }
}

export function writePref(k: PrefKey, v: string | null): void {
  memory.set(k, v);
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    // хранилище недоступно — значение остаётся в памяти
  }
  window.dispatchEvent(new CustomEvent(PREFS_EVENT, { detail: k }));
}

function subscribe(onChange: () => void) {
  window.addEventListener(PREFS_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(PREFS_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** Текущее значение настройки; компонент перерисуется при любой записи. */
export function usePref(k: PrefKey): string | null {
  return useSyncExternalStore(
    subscribe,
    () => readPref(k),
    () => null,
  );
}
