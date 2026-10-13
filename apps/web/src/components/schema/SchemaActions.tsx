/** Кнопки «Экспорт» и «Импорт» в сайдбаре дерева папок; открывают модалки передачи схемы. */
import { useState } from 'react';
import type { FolderNode } from '../../lib/types';
import { Icon } from '../Icon';
import { ExportModal } from './ExportModal';
import { ImportModal } from './ImportModal';

export function SchemaActions({ tree }: { tree: FolderNode[] }) {
  const [open, setOpen] = useState<'export' | 'import' | null>(null);
  return (
    <div className="flex gap-2 px-2 pb-sm">
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen('export')}>
        <Icon name="download" /> Экспорт
      </button>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen('import')}>
        <Icon name="upload" /> Импорт
      </button>
      {open === 'export' && <ExportModal tree={tree} onClose={() => setOpen(null)} />}
      {open === 'import' && <ImportModal onClose={() => setOpen(null)} />}
    </div>
  );
}
