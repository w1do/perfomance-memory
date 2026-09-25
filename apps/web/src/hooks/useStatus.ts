/** Общий кэш /api/status: один промис на вкладку для MCP-полосы, чипа в шапке и hero. */
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Status } from '../lib/types';

let pending: Promise<Status> | null = null;
let cached: Status | null = null;

export function useStatus(): { data: Status | null; error: string | null } {
  const [state, setState] = useState<{ data: Status | null; error: string | null }>({
    data: cached,
    error: null,
  });
  useEffect(() => {
    let alive = true;
    pending ??= api.status();
    pending
      .then((data) => {
        cached = data;
        if (alive) setState({ data, error: null });
      })
      .catch((e: Error) => {
        pending = null; // следующий монтирующийся компонент попробует ещё раз
        if (alive) setState({ data: null, error: e.message });
      });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
