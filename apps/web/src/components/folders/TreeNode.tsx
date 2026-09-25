/**
 * Узел дерева папок (.tree-row из folders.css): раскрытие, выбор, перетаскивание папок и правил,
 * «+ / ✎ / корзина» на hover и focus-within. Логика prompt/confirm и drag&drop — как была в FolderTree.
 */
import { useState, type DragEvent } from 'react';
import { api } from '../../lib/api';
import type { FolderNode } from '../../lib/types';
import { Icon } from '../Icon';

export const DRAG_FOLDER = 'application/x-pm-folder';

export type TreeActions = {
  selected: string | null;
  onSelect: (path: string) => void;
  onDrop: (e: DragEvent, target: FolderNode) => void;
  onCreate: (parent: FolderNode) => void;
  act: (fn: () => Promise<unknown>, ok: string) => Promise<void>;
};

const tint = (name: string) =>
  name === 'Люблю' ? 'text-like-ink' : name === 'Не люблю' ? 'text-dislike-ink' : 'text-muted';

export function TreeNode({ n, ...a }: TreeActions & { n: FolderNode }) {
  const { selected, onSelect, onDrop, onCreate, act } = a;
  const key = n.path.join('/');
  const inSelected = selected !== null && (selected === key || selected.startsWith(`${key}/`));
  const [open, setOpen] = useState(n.depth === 1 || inSelected);
  const [over, setOver] = useState(false);
  const isSelected = selected === key;

  const rename = () => {
    const name = prompt('Новое имя папки', n.name);
    if (name?.trim() && name.trim() !== n.name)
      void act(() => api.updateFolder(n.id, { name: name.trim() }), 'Папка переименована');
  };
  const remove = () => {
    const nonEmpty = n.total_count > 0 || n.children.length > 0;
    const ok = confirm(
      nonEmpty
        ? `Удалить «${n.name}» вместе с вложенными папками и ${n.total_count} правилами?`
        : `Удалить пустую папку «${n.name}»?`,
    );
    if (ok) void act(() => api.removeFolder(n.id, nonEmpty), 'Папка удалена');
  };

  return (
    <li>
      <div
        className="tree-row group"
        aria-current={isSelected || undefined}
        data-drop={over || undefined}
        style={{ paddingInlineStart: `${(n.depth - 1) * 14 + 2}px` }}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_FOLDER, n.id);
          e.stopPropagation();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          setOver(false);
          e.stopPropagation();
          onDrop(e, n);
        }}
      >
        <button
          className="btn-icon h-7 w-7 shrink-0"
          aria-label={open ? 'Свернуть' : 'Развернуть'}
          aria-expanded={open}
          disabled={!n.children.length}
          onClick={() => setOpen((v) => !v)}
        >
          {n.children.length > 0 && (
            <Icon name={open ? 'chevron-down' : 'chevron-right'} className="tree-chevron" />
          )}
        </button>
        <button
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
          onClick={() => onSelect(key)}
        >
          <Icon name={isSelected ? 'folder-open' : 'folder'} className={tint(n.name)} />
          <span className={`truncate ${isSelected ? 'font-semibold' : ''}`}>{n.name}</span>
          <span className="mono ml-auto text-caption text-muted">{n.total_count}</span>
        </button>
        <span className="hidden shrink-0 gap-0.5 group-focus-within:flex group-hover:flex">
          <button className="btn-icon h-7 w-7" aria-label="Подпапка" onClick={() => onCreate(n)}>
            <Icon name="plus" />
          </button>
          <button className="btn-icon h-7 w-7" aria-label="Переименовать" onClick={rename}>
            <Icon name="pencil" />
          </button>
          <button className="btn-icon h-7 w-7" aria-label="Удалить папку" onClick={remove}>
            <Icon name="trash" />
          </button>
        </span>
      </div>
      {open && n.children.length > 0 && (
        <ul className="m-0 list-none p-0">
          {n.children.map((c) => (
            <TreeNode key={c.id} n={c} {...a} />
          ))}
        </ul>
      )}
    </li>
  );
}
