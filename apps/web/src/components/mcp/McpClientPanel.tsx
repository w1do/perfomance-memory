/**
 * Раскрытая часть MCP-полосы: вкладки клиентов (.seg, role=tablist, стрелки/Home/End, выбор в
 * pm.mcp.tab), блоки кода, мини-инструкция и статус. Раскладка — mcp.css (.mcp-panel__cols).
 */
import { useRef, type KeyboardEvent } from 'react';
import { usePref, writePref } from '../../lib/prefs';
import type { Status } from '../../lib/types';
import { McpCodeBlock } from './McpCodeBlock';
import { McpStatusColumn } from './McpStatusColumn';
import { McpSteps } from './McpSteps';
import { CLIENTS, needsHttps, snippetsFor, type McpClient } from './snippets';

const isClient = (v: string | null): v is McpClient => CLIENTS.some((c) => c.id === v);

export function McpClientPanel({
  url,
  status,
  copy,
}: {
  url: string;
  status: Status | null;
  copy: (text: string, okMessage: string) => Promise<boolean>;
}) {
  const saved = usePref('pm.mcp.tab');
  const tab: McpClient = isClient(saved) ? saved : 'claude-code';
  const tabsRef = useRef<HTMLDivElement>(null);
  const { blocks, steps } = snippetsFor(tab, url);
  const httpsHint = needsHttps(url) && (tab === 'claude-desktop' || tab === 'chatgpt');

  const select = (id: McpClient, focus = false) => {
    writePref('pm.mcp.tab', id);
    if (focus) tabsRef.current?.querySelector<HTMLElement>(`#mcp-tab-${id}`)?.focus();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const i = CLIENTS.findIndex((c) => c.id === tab);
    const last = CLIENTS.length - 1;
    const next =
      e.key === 'ArrowRight'
        ? (i + 1) % CLIENTS.length
        : e.key === 'ArrowLeft'
          ? (i + last) % CLIENTS.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : -1;
    const target = CLIENTS[next];
    if (!target) return;
    e.preventDefault();
    select(target.id, true);
  };

  return (
    <div className="mcp-panel">
      <div
        ref={tabsRef}
        className="seg max-w-full justify-self-start overflow-x-auto"
        role="tablist"
        aria-label="Клиент"
        onKeyDown={onKeyDown}
      >
        {CLIENTS.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            id={`mcp-tab-${c.id}`}
            className="seg__item whitespace-nowrap"
            aria-selected={c.id === tab}
            aria-controls="mcp-tabpanel"
            tabIndex={c.id === tab ? 0 : -1}
            onClick={() => select(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div
        id="mcp-tabpanel"
        role="tabpanel"
        aria-labelledby={`mcp-tab-${tab}`}
        className="mcp-panel__cols"
      >
        <div className="flex min-w-0 flex-col gap-sm">
          {blocks.map((b) => (
            <McpCodeBlock
              key={b.label}
              label={b.label}
              code={b.code}
              onCopy={(code) => void copy(code, `${b.label}: скопировано`)}
            />
          ))}
          {httpsHint && (
            <span className="chip self-start border-transparent bg-net-soft text-net-ink">
              Нужен публичный HTTPS: задайте PUBLIC_URL=https://… в .env
            </span>
          )}
        </div>
        <McpSteps steps={steps} />
        <McpStatusColumn status={status} />
      </div>
      <p className="m-0 text-caption text-text-2">
        Токен хранится только в .env и здесь не показывается. Без заголовка сервер ответит 401 — так
        и задумано.
      </p>
    </div>
  );
}
