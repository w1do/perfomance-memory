/**
 * Плашка студии в подвале: кто делает продукт и куда писать. Имя и ссылки — STUDIO_NAME, STUDIO_URL,
 * CONTACT_URL, TELEGRAM_URL из .env (через /api/status). 3D-самолётик — склад CMS (extrude-telegram).
 */
import { useStatus } from '../../hooks/useStatus';
import { Card } from '../ui/Card';

const host = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

export function StudioCard() {
  const links = useStatus().data?.links;
  if (!links || (!links.studio && !links.contact)) return null;
  const name = links.studio_name || host(links.studio);
  return (
    <Card as="aside" tone="ui" icon3d="telegram" icon3dSize="md" className="mb-lg" reveal={false}>
      <div className="card-head flex flex-col gap-2">
        <div className="eyebrow">Разработка digital и AI-продуктов</div>
        <h2 className="text-h3">
          {name} — <em className="text-accent not-italic">сделаем ваш AI-продукт</em>
        </h2>
        <p className="m-0 max-w-text text-text-2">
          Если вам нужен классный AI-продукт — обращайтесь: от идеи и прототипа до запуска.
        </p>
      </div>
      <div className="card-foot">
        {links.contact && (
          <a
            href={links.contact}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary no-underline"
          >
            Связаться со мной
          </a>
        )}
        {links.studio && (
          <a
            href={links.studio}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost no-underline"
          >
            {host(links.studio)}
          </a>
        )}
        {links.telegram && (
          <a
            href={links.telegram}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost no-underline"
          >
            Группа в Telegram
          </a>
        )}
      </div>
    </Card>
  );
}
