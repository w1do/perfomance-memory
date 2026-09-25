/**
 * Ссылки в шапке: «Группа в Telegram» (призрачная) и «Связаться со мной» (сплошная, одна на шапку).
 * Адреса — TELEGRAM_URL и CONTACT_URL из .env через /api/status; пустые не показываются.
 */
import { useStatus } from '../../hooks/useStatus';
import { Icon } from '../Icon';

export function HeaderLinks() {
  const links = useStatus().data?.links;
  if (!links) return null;
  return (
    <>
      {links.telegram && (
        <a
          href={links.telegram}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm hidden no-underline lg:inline-flex"
        >
          <Icon name="chat" />
          <span className="text-caption">Группа в Telegram</span>
        </a>
      )}
      {links.contact && (
        <a
          href={links.contact}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary btn-sm hidden no-underline sm:inline-flex"
        >
          <span className="text-caption">Связаться со мной</span>
        </a>
      )}
    </>
  );
}
