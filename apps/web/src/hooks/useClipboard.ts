/**
 * Копирование в буфер: navigator.clipboard (https/localhost), иначе скрытая textarea и
 * execCommand (http по локальной сети). Итог сообщается тостом; возвращает true при успехе.
 */
import { useCallback } from 'react';
import { useToast } from '../components/Toasts';

function copyViaTextarea(text: string): boolean {
  const active = document.activeElement as HTMLElement | null;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.readOnly = true;
  ta.setAttribute('aria-hidden', 'true');
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  document.body.append(ta);
  ta.select();
  let ok: boolean;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  active?.focus?.();
  return ok;
}

async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // запасной путь ниже
    }
  }
  return copyViaTextarea(text);
}

export function useClipboard(): (text: string, okMessage: string) => Promise<boolean> {
  const toast = useToast();
  return useCallback(
    async (text: string, okMessage: string) => {
      const ok = await copyText(text);
      if (ok) toast(okMessage, 'success');
      else toast('Не удалось скопировать — выделите текст и нажмите Ctrl+C', 'error');
      return ok;
    },
    [toast],
  );
}
