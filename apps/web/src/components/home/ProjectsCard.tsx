/**
 * Проекты (роль enrich, 3D-звезда): строки .row-item — иконка проекта, имя, число правил, шеврон.
 * Данные — дерево папок, ветка «Проекты». Токены frost-01.
 */
import { useAsync } from '../../hooks/useAsync';
import { api } from '../../lib/api';
import { Icon } from '../Icon';
import { Card } from '../ui/Card';
import { CardHeader } from './CardHeader';

export function ProjectsCard({
  className = '',
  index = 6,
  onOpenFolder,
}: {
  className?: string;
  index?: number;
  onOpenFolder: (path: string) => void;
}) {
  const { data } = useAsync(api.folders, []);
  const projects = data?.tree.find((n) => n.name === 'Проекты')?.children ?? [];

  return (
    <Card
      tone="enrich"
      icon3d="projects"
      icon3dSize="lg"
      index={index}
      lift
      className={`flex flex-col ${className}`}
      aria-labelledby="projects-title"
    >
      <CardHeader id="projects-title" eyebrow="Проекты" title="Правила проектов" />
      {projects.length === 0 ? (
        <p className="m-0 text-text-2">
          Назовите проект во фразе — «в проекте Дача…» — и он появится здесь
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {projects.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="row-item w-full text-left"
                onClick={() => onOpenFolder(p.path.join('/'))}
              >
                <Icon name="project" className="text-enrich-ink" />
                <span className="min-w-0 flex-1 truncate font-medium text-text">{p.name}</span>
                <span className="mono text-caption text-muted">{p.total_count}</span>
                <Icon name="chevron-right" className="text-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
