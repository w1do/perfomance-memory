/**
 * Дерево с галочками для экспорта и импорта. Отмеченный узел включает вложенные (они disabled и отмечены сами).
 * Корневые узлы раскрыты, остальные свёрнуты. Текст пакета выводится как текст, без HTML.
 */
import { useState, type ReactNode } from 'react';
import { Icon } from '../Icon';

export interface CheckNode {
  key: string;
  name: string;
  meta?: string;
  children: CheckNode[];
  detail?: ReactNode;
}

interface Props {
  nodes: CheckNode[];
  checked: Set<string>;
  implied?: boolean;
  onToggle: (key: string) => void;
  depth?: number;
}

export function CheckTree({ nodes, checked, implied = false, onToggle, depth = 0 }: Props) {
  return (
    <div>
      {nodes.map((node) => (
        <CheckRow
          key={node.key}
          node={node}
          checked={checked}
          implied={implied}
          onToggle={onToggle}
          depth={depth}
        />
      ))}
    </div>
  );
}

function CheckRow({
  node,
  checked,
  implied,
  onToggle,
  depth,
}: Required<Pick<Props, 'checked' | 'implied' | 'onToggle' | 'depth'>> & { node: CheckNode }) {
  const [open, setOpen] = useState(depth === 0);
  const expandable = node.children.length > 0 || node.detail !== undefined;
  const isChecked = implied || checked.has(node.key);
  return (
    <div>
      <div
        className="tree-row flex items-center gap-2 py-1"
        style={{ paddingInlineStart: depth * 14 + 2 }}
      >
        {expandable ? (
          <button
            type="button"
            className="btn-icon h-6 w-6 shrink-0"
            aria-expanded={open}
            aria-label={open ? 'Свернуть' : 'Развернуть'}
            onClick={() => setOpen(!open)}
          >
            <Icon name={open ? 'chevron-down' : 'chevron-right'} />
          </button>
        ) : (
          <span className="h-6 w-6 shrink-0" aria-hidden="true" />
        )}
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <input
            type="checkbox"
            checked={isChecked}
            disabled={implied}
            onChange={() => onToggle(node.key)}
          />
          <span className="min-w-0 break-words">{node.name}</span>
          {node.meta && <span className="mono ml-auto text-caption text-muted">{node.meta}</span>}
        </label>
      </div>
      {open && node.detail}
      {open && node.children.length > 0 && (
        <CheckTree
          nodes={node.children}
          checked={checked}
          implied={isChecked}
          onToggle={onToggle}
          depth={depth + 1}
        />
      )}
    </div>
  );
}
