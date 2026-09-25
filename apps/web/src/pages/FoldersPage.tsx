/**
 * Экран папок: дерево слева (sticky от 1024), справа шапка папки с поиском и фильтрами
 * и колонки «Люблю / Не люблю». Раскладка — styles/folders.css; модалка PREFERENCES.md — Modal lg.
 */
import { useState } from 'react';
import { EmptyState } from '../components/folders/EmptyState';
import { FolderHeaderCard } from '../components/folders/FolderHeaderCard';
import { PolarityColumn } from '../components/folders/PolarityColumn';
import { FolderTree } from '../components/FolderTree';
import { Modal } from '../components/Modal';
import { useAsync } from '../hooks/useAsync';
import { useDebounced } from '../hooks/useDebounced';
import { api } from '../lib/api';
import type { Filters } from '../lib/types';
import '../styles/folders.css';

export function FoldersPage({
  path,
  onSelect,
}: {
  path: string | null;
  onSelect: (path: string | null) => void;
}) {
  const [filters, setFilters] = useState<Filters>({});
  const [query, setQuery] = useState('');
  const [mainFile, setMainFile] = useState<string | null>(null);
  const q = useDebounced(query.trim(), 300);
  const scope: Filters = { ...filters, folder: path ?? undefined };

  const tree = useAsync(api.folders, []);
  const facets = useAsync(() => api.facets(scope), [JSON.stringify(scope)]);
  const prefs = useAsync(
    () => api.list({ ...scope, q: q || undefined, limit: 200 }),
    [JSON.stringify(scope), q],
  );

  const items = prefs.data?.items.map((i) => i.preference) ?? [];
  const like = items.filter((p) => p.polarity === 'like');
  const dislike = items.filter((p) => p.polarity === 'dislike');
  const filtered = Boolean(q) || Object.values(filters).some((v) => v !== undefined);
  const openMainFile = async () => setMainFile(await api.exportMd(path ?? undefined));
  const reset = () => {
    setFilters({});
    setQuery('');
  };

  return (
    <div className="folders-layout">
      <FolderTree
        tree={tree.data?.tree ?? []}
        selected={path}
        onSelect={onSelect}
        onOpenMainFile={openMainFile}
      />

      <div className="flex min-w-0 flex-col gap-md">
        <FolderHeaderCard
          path={path}
          onSelect={onSelect}
          counts={{ like: like.length, dislike: dislike.length }}
          filterBar={{
            facets: facets.data,
            filters,
            onChange: setFilters,
            query,
            onQuery: setQuery,
          }}
        />

        {prefs.error && <p className="m-0 text-danger">{prefs.error}</p>}
        {!prefs.loading && items.length === 0 ? (
          <EmptyState kind={filtered ? 'filtered' : path ? 'folder' : 'nothing'} onReset={reset} />
        ) : (
          <div className="pref-columns">
            <PolarityColumn polarity="like" items={like} />
            <PolarityColumn polarity="dislike" items={dislike} />
          </div>
        )}
      </div>

      {mainFile !== null && (
        <Modal
          size="lg"
          tone="accent"
          title="PREFERENCES.md"
          eyebrow={path ? `Ветка ${path}` : 'Главный файл'}
          onClose={() => setMainFile(null)}
        >
          <pre className="mono m-0 text-[14px] whitespace-pre-wrap text-text-2">{mainFile}</pre>
        </Modal>
      )}
    </div>
  );
}
