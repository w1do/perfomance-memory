/** Текст тоста после сохранения правила: куда легло и что сделал сервис (создал, обновил, дубль, проект). */
import type { SaveResult } from './types';

export function resultMessage(r: SaveResult): string {
  const where = r.folder.path.join(' › ');
  switch (r.action) {
    case 'created':
      return `Сохранено в «${where}»`;
    case 'updated':
      return `Конфликт: правило обновлено и перенесено в «${where}», прежняя версия — в истории`;
    case 'duplicate':
      return `Такое правило уже есть в «${where}» — обновил дату и силу`;
    case 'project_created':
      return `Проект создан: «${where}»`;
  }
}
