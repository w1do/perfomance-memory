/**
 * Чип «MCP · Копировать» в шапке (эффект pin frost-01): появляется, когда MCP-полоса ушла из вида
 * или её нет на экране. Стили — .mcp-chip в mcp.css, появление — .enter (fade-up).
 */
import { useClipboard } from '../../hooks/useClipboard';
import { useStatus } from '../../hooks/useStatus';
import { writePref } from '../../lib/prefs';

export function McpHeaderChip({ onOpen }: { onOpen: () => void }) {
  const { data } = useStatus();
  const copy = useClipboard();
  const svc = data?.services;
  const state = !svc
    ? 'pending'
    : [svc.api, svc.mcp, svc.qdrant].every((s) => s === 'ok')
      ? 'ok'
      : 'down';
  const url = data?.mcp.url;
  return (
    <div className="mcp-chip enter">
      <span className="status-dot" data-state={state} aria-hidden="true" />
      <button
        type="button"
        className="font-semibold text-text"
        onClick={onOpen}
        title="Как подключить агента"
      >
        MCP
      </button>
      {url && <span className="mcp-chip__url mono text-text-2">{url}</span>}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={!url}
        onClick={async () => {
          if (url && (await copy(url, 'Адрес MCP скопирован'))) writePref('pm.mcp.copied', '1');
        }}
      >
        Копировать
      </button>
    </div>
  );
}
