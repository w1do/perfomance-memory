import { useCallback, useEffect, useState } from 'react';

export type Route = { page: 'home' } | { page: 'folders'; path: string | null };

function parse(): Route {
  const url = new URL(window.location.href);
  if (url.pathname.startsWith('/folders'))
    return { page: 'folders', path: url.searchParams.get('path') };
  return { page: 'home' };
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const onPop = () => setRoute(parse());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const navigate = useCallback((next: Route) => {
    const url =
      next.page === 'home'
        ? '/'
        : `/folders${next.path ? `?path=${encodeURIComponent(next.path)}` : ''}`;
    window.history.pushState(null, '', url);
    setRoute(next);
    window.scrollTo({ top: 0 });
  }, []);
  return { route, navigate };
}
