/**
 * PREFERENCES.md (акцент 2): тёмная карточка card--deep с sheen, парящим 3D-документом и свечением
 * blobs-05 (.main-glow, home.css); превью первых 8 строк, «Открыть» (Modal) и «Скачать».
 */
import { useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { api } from '../../lib/api';
import { Icon } from '../Icon';
import { Modal } from '../Modal';
import { Card } from '../ui/Card';
import { CardHeader } from './CardHeader';

export function MainFileCard({
  className = '',
  index = 7,
}: {
  className?: string;
  index?: number;
}) {
  const { data } = useAsync(() => api.exportMd(), []);
  const [open, setOpen] = useState(false);
  const lines = (data ?? '').split('\n');
  const empty = !data || !data.trim();

  return (
    <Card
      variant="deep"
      tone="accent"
      icon3d="main-file"
      icon3dSize="md"
      float
      sheen
      index={index}
      lift
      deco={<span className="main-glow" />}
      className={`flex flex-col ${className}`}
      aria-labelledby="main-title"
    >
      <CardHeader id="main-title" eyebrow="Главный файл" title="PREFERENCES.md" />
      {empty ? (
        <p className="m-0 text-on-deep-2">Файл соберётся после первого правила</p>
      ) : (
        <pre className="mono main-preview">{lines.slice(0, 8).join('\n')}</pre>
      )}
      <div className="card-foot">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setOpen(true)}
          disabled={empty}
        >
          Открыть
        </button>
        <a className="btn btn-ghost btn-sm" href="/api/export.md" download="PREFERENCES.md">
          <Icon name="download" /> Скачать
        </a>
      </div>
      {open && (
        <Modal title="PREFERENCES.md" eyebrow="Главный файл" onClose={() => setOpen(false)}>
          <pre className="mono m-0 whitespace-pre-wrap text-text-2">{data}</pre>
        </Modal>
      )}
    </Card>
  );
}
