/**
 * Шапка на всю ширину: прозрачная, после прокрутки — стекло (.app-header[data-scrolled], base.css).
 * Навигация .seg; справа чип MCP (pin), «Подсказки», тема (текстом: иконки moon нет на складе), выход.
 */
import { useHints } from '../hooks/useHints';
import type { Route } from '../hooks/useRoute';
import { useScrolled } from '../hooks/useScrolled';
import type { Theme } from '../hooks/useTheme';
import { emit, MCP_OPEN_EVENT } from '../lib/events';
import { useMcpBarVisibility } from '../lib/mcpBarVisibility';
import { Icon } from './Icon';
import { HeaderLinks } from './brand/HeaderLinks';
import { McpHeaderChip } from './mcp/McpHeaderChip';

export function Header({
  route,
  navigate,
  theme,
  toggleTheme,
  onLogout,
}: {
  route: Route;
  navigate: (r: Route) => void;
  theme: Theme;
  toggleTheme: () => void;
  onLogout: (() => void) | null;
}) {
  const scrolled = useScrolled(8);
  const hints = useHints();
  const bar = useMcpBarVisibility();
  const home = route.page === 'home';
  const showChip = !home || bar !== 'visible';
  const openMcp = () => {
    if (home) return emit(MCP_OPEN_EVENT);
    navigate({ page: 'home' });
    window.setTimeout(() => emit(MCP_OPEN_EVENT), 60);
  };

  return (
    <header className="app-header" data-scrolled={scrolled || undefined}>
      <a
        href="/"
        className="mr-auto flex min-w-0 items-center gap-2 font-heading text-lead font-bold tracking-heading text-text no-underline"
        onClick={(e) => (e.preventDefault(), navigate({ page: 'home' }))}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-accent text-accent-contrast">
          <Icon name="ai" />
        </span>
        <span className="hidden truncate lg:inline">Память предпочтений</span>
      </a>
      <nav className="seg" aria-label="Разделы">
        <button
          type="button"
          className="seg__item"
          aria-current={home ? 'page' : undefined}
          onClick={() => navigate({ page: 'home' })}
        >
          Главная
        </button>
        <button
          type="button"
          className="seg__item"
          aria-current={!home ? 'page' : undefined}
          onClick={() => navigate({ page: 'folders', path: null })}
        >
          Папки
        </button>
      </nav>
      {showChip && (
        <span className="hidden md:inline-flex">
          <McpHeaderChip onOpen={openMcp} />
        </span>
      )}
      <HeaderLinks />
      {home && hints.hidden && (
        <button
          type="button"
          className="btn btn-ghost btn-sm hidden sm:inline-flex"
          onClick={hints.show}
        >
          Подсказки
        </button>
      )}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
      >
        {theme === 'dark' && <Icon name="sun" />}
        <span className="text-caption">{theme === 'dark' ? 'Светлая' : 'Тёмная'}</span>
      </button>
      {onLogout && (
        <button type="button" className="btn-icon" onClick={onLogout} aria-label="Выйти">
          <Icon name="logout" />
        </button>
      )}
    </header>
  );
}
