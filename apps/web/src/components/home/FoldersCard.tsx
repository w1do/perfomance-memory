/**
 * Папки (роль service, 3D-закладка): плитки .tile тематических корней, а если их нет — плитки проектов;
 * под заголовком реальный счёт правил и папок по дереву. Токены frost-01, сетка .tiles — home.css.
 */
import { useAsync } from '../../hooks/useAsync';
import { api } from '../../lib/api';
import { domainIcon } from '../../lib/assets';
import type { FolderNode } from '../../lib/types';
import { Icon } from '../Icon';
import { Card } from '../ui/Card';
import { CardHeader } from './CardHeader';
import { FOLDERS, plural, RULES } from './plural';

const PROJECTS = 'Проекты';
const countNodes = (nodes: FolderNode[]): number =>
  nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0);

export function FoldersCard({
  className = '',
  index = 5,
  onOpenFolder,
}: {
  className?: string;
  index?: number;
  onOpenFolder: (path: string | null) => void;
}) {
  const { data } = useAsync(api.folders, []);
  const tree = data?.tree ?? [];
  const themes = tree.filter((n) => n.name !== PROJECTS);
  const projects = tree.find((n) => n.name === PROJECTS)?.children ?? [];
  const onlyProjects = themes.length === 0 && projects.length > 0;
  const tiles = onlyProjects ? projects : themes;
  const rules = tree.reduce((sum, n) => sum + n.total_count, 0);
  const folders = countNodes(tree);

  return (
    <Card
      tone="service"
      icon3d="folders"
      icon3dSize="lg"
      index={index}
      lift
      className={`flex flex-col ${className}`}
      aria-labelledby="folders-title"
    >
      <CardHeader
        id="folders-title"
        eyebrow="Папки"
        title="Дерево тем"
        sub={
          data &&
          folders > 0 && (
            <>
              <span className="mono text-text">{rules}</span> {plural(rules, RULES)} ·{' '}
              <span className="mono text-text">{folders}</span> {plural(folders, FOLDERS)}
              {onlyProjects && ' — тематических папок пока нет, правила лежат в проектах'}
            </>
          )
        }
      />
      {data && tiles.length === 0 ? (
        <p className="m-0 text-text-2">Папки появятся сами, когда модель разложит первые правила</p>
      ) : (
        <ul className="tiles">
          {tiles.map((n) => (
            <li key={n.id} className="flex">
              <button
                type="button"
                className="tile w-full text-left"
                onClick={() => onOpenFolder(n.path.join('/'))}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-ui-soft text-ui-ink">
                  <Icon name={onlyProjects ? 'project' : domainIcon(n.domain)} />
                </span>
                <span className="tile__name">{n.name}</span>
                <span className="mono text-caption text-muted">
                  {onlyProjects && `${PROJECTS} · `}
                  {n.total_count} {plural(n.total_count, RULES)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="card-foot">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpenFolder(null)}>
          Все папки →
        </button>
      </div>
    </Card>
  );
}
