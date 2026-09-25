/**
 * Пустые состояния экрана папок: по запросу/фильтрам ничего — 3D search (ui) и «Сбросить фильтры»;
 * пустая папка — 3D new-entry (ai); в базе вообще нет правил — иллюстрация склада empty.
 */
import { Icon3D } from '../fx/Icon3D';
import { Illustration } from '../Illustration';
import { Card } from '../ui/Card';

export function EmptyState({
  kind,
  onReset,
}: {
  kind: 'filtered' | 'folder' | 'nothing';
  onReset: () => void;
}) {
  return (
    <Card
      tone={kind === 'filtered' ? 'ui' : 'ai'}
      index={1}
      lift={false}
      className="flex flex-col items-center gap-sm py-lg text-center"
    >
      {kind === 'filtered' && <Icon3D name="search" size="sm" placement="center" tone="ui" />}
      {kind === 'folder' && <Icon3D name="new-entry" size="sm" placement="center" tone="ai" />}
      {kind === 'nothing' && <Illustration name="empty" className="w-48 text-muted" />}
      {kind === 'filtered' ? (
        <>
          <p className="m-0 max-w-text text-lead">
            Ничего не нашлось — попробуйте другое слово или снимите фильтры
          </p>
          <button className="btn btn-ghost btn-sm" onClick={onReset}>
            Сбросить фильтры
          </button>
        </>
      ) : (
        <>
          <p className="m-0 text-lead font-semibold">Здесь пока нет правил</p>
          <p className="m-0 max-w-text text-text-2">
            Попробуйте искать по смыслу: «длинные файлы», «спиннинг»
          </p>
        </>
      )}
    </Card>
  );
}
