/**
 * Плашка «Состояние» MCP-панели: сервисы строкой со .status-dot, режим записи, активные модели таблицей.
 * Только данные /api/status (без секретов); цвета — токены frost-01 и роли.
 */
import type { Status } from '../../lib/types';

const SERVICES = ['api', 'mcp', 'qdrant'] as const;

export function McpStatusColumn({ status }: { status: Status | null }) {
  const write = status?.mcp.allow_write;
  const models = status && [
    ['LLM', status.models.llm],
    ['Речь', status.models.stt],
    ['Векторы', `${status.models.embed} · ${status.models.embed_dim}`],
  ];
  return (
    <div className="flex min-w-0 flex-col gap-sm rounded-md bg-surface-2/70 p-sm ring-1 ring-border">
      <div className="eyebrow">Состояние</div>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {SERVICES.map((s) => {
          const state = !status ? 'pending' : status.services[s] === 'ok' ? 'ok' : 'down';
          return (
            <li
              key={s}
              className="flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-caption ring-1 ring-border"
              title={state === 'ok' ? 'работает' : state === 'down' ? 'недоступен' : 'проверяю'}
            >
              <span className="status-dot" data-state={state} aria-hidden="true" />
              <span className="mono text-text">{s}</span>
              <span className="sr-only">{state === 'ok' ? 'работает' : 'недоступен'}</span>
            </li>
          );
        })}
      </ul>
      {status && (
        <span
          className={`chip self-start border-transparent ${
            write ? 'bg-service-soft text-service-ink' : 'bg-ui-soft text-ui-ink'
          }`}
        >
          {write ? 'Запись включена: add_preference' : 'Только чтение'}
        </span>
      )}
      {models && (
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-caption">
          {models.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="mono m-0 break-words text-text">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
