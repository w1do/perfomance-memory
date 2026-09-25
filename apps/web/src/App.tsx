import { useCallback, useEffect, useState } from 'react';
import { PageBackdrop } from './components/fx/PageBackdrop';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { McpConnectBar } from './components/mcp/McpConnectBar';
import { ToastProvider } from './components/Toasts';
import { useAmbientMotion } from './hooks/useAmbientMotion';
import { useRoute } from './hooks/useRoute';
import { useTheme } from './hooks/useTheme';
import { AUTH_EVENT, api } from './lib/api';
import { writePref } from './lib/prefs';
import { FoldersPage } from './pages/FoldersPage';
import { HomePage } from './pages/HomePage';
import { Login } from './pages/Login';

type Auth = { required: boolean; ok: boolean } | null;

/** Оболочка: фон (PageBackdrop), шапка, MCP-полоса над bento главной, страницы, подвал. */
export function App() {
  const { theme, toggle } = useTheme();
  const { route, navigate } = useRoute();
  const [auth, setAuth] = useState<Auth>(null);
  useAmbientMotion();

  const check = useCallback(() => {
    api
      .me()
      .then((m) => setAuth({ required: m.auth_required, ok: m.authenticated }))
      .catch(() => setAuth({ required: false, ok: true }));
  }, []);

  useEffect(() => {
    check();
    const onUnauthorized = () =>
      setAuth((a) => ({ required: true, ok: false, ...(a ? { required: a.required } : {}) }));
    window.addEventListener(AUTH_EVENT, onUnauthorized);
    return () => window.removeEventListener(AUTH_EVENT, onUnauthorized);
  }, [check]);

  useEffect(() => {
    if (auth?.ok && route.page === 'folders') writePref('pm.visited.folders', '1');
  }, [auth?.ok, route.page]);

  const openFolder = (path: string | null) => navigate({ page: 'folders', path });
  const home = route.page === 'home';

  return (
    <div className="app-shell">
      <PageBackdrop page={!auth?.ok ? 'login' : route.page} />
      {auth === null ? null : !auth.ok ? (
        <Login onDone={check} />
      ) : (
        <ToastProvider>
          <Header
            route={route}
            navigate={navigate}
            theme={theme}
            toggleTheme={toggle}
            onLogout={auth.required ? () => void api.logout().then(check) : null}
          />
          <main className={`app-main ${home ? 'app-main--dock' : ''}`}>
            {home && <McpConnectBar />}
            {home ? (
              <HomePage openFolder={openFolder} />
            ) : (
              <FoldersPage path={route.path} onSelect={openFolder} />
            )}
          </main>
          <Footer />
        </ToastProvider>
      )}
    </div>
  );
}
