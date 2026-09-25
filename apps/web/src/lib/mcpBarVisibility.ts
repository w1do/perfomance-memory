/**
 * Видимость MCP-полосы (эффект pin из frost-01): полоса пишет, шапка читает и показывает чип.
 * Начальное 'visible' — чтобы чип не мигал на главной до первого срабатывания IntersectionObserver.
 */
import { useSyncExternalStore } from 'react';

export type McpBarVisibility = 'visible' | 'hidden' | 'absent';

let state: McpBarVisibility = 'visible';
const listeners = new Set<() => void>();

export function setMcpBarVisibility(next: McpBarVisibility): void {
  if (next === state) return;
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useMcpBarVisibility(): McpBarVisibility {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}
