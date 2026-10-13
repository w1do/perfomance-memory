/** Экспорт схемы: «всё» или выбор папок галочками (родитель включает вложенные), затем скачивание JSON. */
import { useState } from 'react';
import { api } from '../../lib/api';
import { downloadJson, schemaFileName } from '../../lib/schemaFile';
import type { FolderNode } from '../../lib/types';
import { Field } from '../Field';
import { Icon } from '../Icon';
import { Modal } from '../Modal';
import { useToast } from '../Toasts';
import { CheckTree, type CheckNode } from './CheckTree';

const toCheck = (nodes: FolderNode[]): CheckNode[] =>
  nodes.map((n) => ({
    key: n.id,
    name: n.name,
    meta: String(n.total_count),
    children: toCheck(n.children),
  }));

export function ExportModal({ tree, onClose }: { tree: FolderNode[]; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [author, setAuthor] = useState('');
  const [description, setDescription] = useState('');
  const [all, setAll] = useState(true);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const toggle = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const submit = async () => {
    setBusy(true);
    try {
      const pkg = await api.exportSchema({
        all,
        folder_ids: all ? [] : [...checked],
        name: name.trim(),
        author: author.trim() || null,
        description: description.trim() || null,
      });
      downloadJson(pkg, schemaFileName(name));
      toast(`Скачан файл: правил ${pkg.counts.preferences}`);
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Не удалось экспортировать', 'error');
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || !name.trim() || (!all && checked.size === 0);

  return (
    <Modal
      title="Экспорт схемы"
      eyebrow="Поделиться правилами"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-primary" disabled={disabled} onClick={submit}>
            <Icon name="download" /> Скачать JSON
          </button>
          <button className="btn btn-ghost" onClick={onClose}>
            Отмена
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <Field label="Название">
          <input
            className="input"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Автор">
          <input
            className="input"
            value={author}
            maxLength={120}
            onChange={(e) => setAuthor(e.target.value)}
          />
        </Field>
        <Field label="Описание">
          <textarea
            className="input"
            value={description}
            maxLength={2000}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={all} onChange={() => setAll(!all)} />
          <span>Всё дерево</span>
        </label>
        <CheckTree nodes={toCheck(tree)} checked={checked} implied={all} onToggle={toggle} />
      </div>
    </Modal>
  );
}
