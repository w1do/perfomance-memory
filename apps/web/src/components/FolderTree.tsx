/**
 * Дерево папок: Card aside (роль ui, без 3D), до 1024 свёрнуто в .collapse с кнопкой «Дерево папок»,
 * от 1024 — sticky слева (folders.css). Сверху PREFERENCES.md и «Все правила», ниже темы и «Проекты».
 */
import { useState, type DragEvent } from 'react';
import { api } from '../lib/api';
import type { FolderNode } from '../lib/types';
import { DRAG_FOLDER, TreeNode, type TreeActions } from './folders/TreeNode';
import { Icon } from './Icon';
import { DRAG_PREFERENCE } from './PreferenceCard';
import { useToast } from './Toasts';
import { Card } from './ui/Card';
import { Tip } from './ui/Tip';

interface Props {
  tree: FolderNode[];
  selected: string | null;
  onSelect: (path: string | null) => void;
  onOpenMainFile: () => void;
}

export function FolderTree({ tree, selected, onSelect, onOpenMainFile }: Props) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const projects = tree.find((n) => n.depth === 1 && n.name === 'Проекты');
  const topics = tree.filter((n) => n !== projects);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast(ok, 'info');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const create = (parent: FolderNode | null) => {
    const name = prompt(
      parent ? `Новая папка внутри «${parent.name}»` : 'Новая папка верхнего уровня',
    );
    if (name?.trim())
      void act(() => api.createFolder(name.trim(), parent?.id ?? null), 'Папка создана');
  };

  const onDrop = async (e: DragEvent, target: FolderNode | null) => {
    e.preventDefault();
    const folderId = e.dataTransfer.getData(DRAG_FOLDER);
    const prefId = e.dataTransfer.getData(DRAG_PREFERENCE);
    if (folderId && folderId !== target?.id) {
      await act(
        () => api.updateFolder(folderId, { parent_id: target?.id ?? null }),
        'Папка перенесена',
      );
    } else if (prefId && target) {
      await act(
        () => api.update(prefId, { folder_path: target.path }),
        `Правило перенесено в «${target.path.join(' › ')}»`,
      );
    }
  };

  const actions: TreeActions = { selected, onSelect, onDrop, onCreate: create, act };
  const list = (nodes: FolderNode[]) => (
    <ul className="m-0 list-none p-0">
      {nodes.map((n) => (
        <TreeNode key={n.id} n={n} {...actions} />
      ))}
    </ul>
  );

  return (
    <Card as="aside" className="folders-tree" tone="ui" reveal={false} lift={false}>
      <button
        className="folders-tree__toggle btn btn-ghost btn-sm w-full justify-between"
        aria-expanded={open}
        aria-controls="folders-tree-body"
        onClick={() => setOpen((v) => !v)}
      >
        Дерево папок
        <Icon name={open ? 'chevron-down' : 'chevron-right'} />
      </button>
      <div id="folders-tree-body" className="collapse" data-open={open}>
        <nav aria-label="Папки" className="flex flex-col gap-0.5 p-0.5">
          <button className="tree-row px-2 text-left" onClick={onOpenMainFile}>
            <Icon name="file" className="text-accent" />
            <span className="mono flex-1 text-caption">PREFERENCES.md</span>
          </button>
          <div
            className="tree-row"
            aria-current={selected === null || undefined}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, null)}
          >
            <button
              className="flex flex-1 items-center gap-2 px-2 py-1.5 text-left"
              onClick={() => onSelect(null)}
            >
              <Icon name="folder-open" className="text-muted" />
              <span className="font-medium">Все правила</span>
            </button>
            <button
              className="btn-icon h-7 w-7"
              aria-label="Новая папка"
              onClick={() => create(null)}
            >
              <Icon name="plus" />
            </button>
          </div>
          {list(topics)}
          {projects && (
            <>
              <div className="mt-sm px-2">
                <Tip content="Правила, привязанные к конкретному проекту">
                  {(t) => (
                    <span {...t} className="eyebrow cursor-help rounded-sm">
                      Проекты
                    </span>
                  )}
                </Tip>
              </div>
              {/* подпись «Проекты» уже есть — корень не дублируем, сразу сами проекты */}
              {list(projects.children)}
            </>
          )}
          <p className="m-0 mt-sm px-2 text-caption text-text-2">
            Перетащите правило на папку, чтобы перенести
          </p>
        </nav>
      </div>
    </Card>
  );
}
