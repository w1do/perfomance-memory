/** Значение с задержкой: обновляется, когда `value` не меняется `ms` миллисекунд (поиск на экране папок). */
import { useEffect, useState } from 'react';

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
