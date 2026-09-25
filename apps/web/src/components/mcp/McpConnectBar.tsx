/**
 * MCP-полоса «Подключите память к агенту» — первая строка главной на всю ширину (Card glass, роль mcp,
 * орбиты aura-orbits.svg склада). Адрес копируется одной кнопкой; инструкция раскрывается .collapse.
 * IntersectionObserver пишет видимость в mcpBarVisibility — по ней шапка показывает чип (pin).
 */
import { useEffect, useRef, useState } from 'react';
import { useClipboard } from '../../hooks/useClipboard';
import { useStatus } from '../../hooks/useStatus';
import { MCP_OPEN_EVENT, useWindowEvent } from '../../lib/events';
import { setMcpBarVisibility } from '../../lib/mcpBarVisibility';
import { readPref, writePref } from '../../lib/prefs';
import { Icon3D } from '../fx/Icon3D';
import { Icon } from '../Icon';
import { Card } from '../ui/Card';
import { McpClientPanel } from './McpClientPanel';

const initiallyOpen = () => {
  const open = readPref('pm.mcp.open');
  return open === '1'; // по умолчанию свёрнуто: компактная строка, инструкция — по кнопке «Как подключить»
};

export function McpConnectBar() {
  const { data } = useStatus();
  const copy = useClipboard();
  const url = data?.mcp.url ?? '';
  const [open, setOpen] = useState(initiallyOpen);
  const [copied, setCopied] = useState(false);
  const barRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const svc = data?.services;
  const state = !svc
    ? 'pending'
    : [svc.api, svc.mcp, svc.qdrant].every((s) => s === 'ok')
      ? 'ok'
      : 'down';

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) =>
      setMcpBarVisibility(e?.isIntersecting ? 'visible' : 'hidden'),
    );
    io.observe(el);
    return () => {
      io.disconnect();
      setMcpBarVisibility('absent');
    };
  }, []);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  useWindowEvent(MCP_OPEN_EVENT, () => {
    setOpen(true);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    barRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  });

  const toggle = () => {
    writePref('pm.mcp.open', open ? '0' : '1');
    setOpen(!open);
  };
  const copyAddress = async () => {
    if (!url) return;
    if (await copy(url, 'Адрес MCP скопирован')) {
      setCopied(true);
      if (readPref('pm.mcp.copied') !== '1') {
        writePref('pm.mcp.copied', '1');
        writePref('pm.mcp.open', '0');
      }
    } else inputRef.current?.select();
  };

  return (
    <Card
      ref={barRef}
      as="section"
      variant="glass"
      tone="mcp"
      lift={false}
      index={0}
      className="mcp-bar"
      aria-labelledby="mcp-bar-title"
      deco={<span className="mcp-orbits" />}
    >
      <div className="mcp-row">
        <div className="mcp-row__emblem relative">
          <Icon3D name="mcp" size="emblem" placement="inline" />
          <span className="status-dot absolute right-0 bottom-1" data-state={state} />
        </div>
        <div className="mcp-row__text min-w-0">
          <div className="eyebrow">MCP · для агентов</div>
          <h2 id="mcp-bar-title" className="text-[20px] leading-tight font-bold">
            Подключите память к <em className="text-accent not-italic">агенту</em>
          </h2>
          <p className="m-0 text-[15px] text-text-2">
            Скажите агенту «учти мои предпочтения» — он вызовет{' '}
            <code className="mono">get_context_for_task</code>
          </p>
        </div>
        <div className="mcp-row__addr">
          <input
            ref={inputRef}
            className="input mono min-w-0 flex-1 truncate"
            readOnly
            aria-label="Адрес MCP-сервера"
            value={url || 'загрузка…'}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            className="btn btn-primary shrink-0"
            onClick={copyAddress}
            disabled={!url}
          >
            {copied ? <Icon name="check" /> : null}
            {copied ? 'Скопировано' : 'Копировать адрес'}
          </button>
        </div>
        <div className="mcp-row__toggle">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-expanded={open}
            aria-controls="mcp-howto"
            onClick={toggle}
          >
            Как подключить
            <Icon name="chevron-down" className="mcp-chevron" />
          </button>
        </div>
      </div>
      <div id="mcp-howto" className="collapse" data-open={open}>
        <div inert={!open}>
          <McpClientPanel url={url || '<PUBLIC_URL>/mcp'} status={data} copy={copy} />
        </div>
      </div>
    </Card>
  );
}
