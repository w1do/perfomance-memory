/** Видимость карточки «Как пользоваться»: флаг pm.hints.hidden в prefs (кнопка «Подсказки» в шапке). */
import { useCallback } from 'react';
import { usePref, writePref } from '../lib/prefs';

export function useHints(): { hidden: boolean; hide(): void; show(): void } {
  const hidden = usePref('pm.hints.hidden') === '1';
  const hide = useCallback(() => writePref('pm.hints.hidden', '1'), []);
  const show = useCallback(() => writePref('pm.hints.hidden', null), []);
  return { hidden, hide, show };
}
