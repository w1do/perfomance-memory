/**
 * Подвал: плашка студии (StudioCard) и подпись «Сделано для YouTube-канала W1DO_DIGITAL» — ссылка из YOUTUBE_URL.
 * Атрибуция наборов склада CMS (Hero Patterns требует подписи автора, CC BY 4.0) — в README, раздел «Оформление».
 */
import { useStatus } from '../hooks/useStatus';
import { StudioCard } from './brand/StudioCard';

export function Footer() {
  const youtube = useStatus().data?.links.youtube;
  const channel = <span className="font-semibold text-text">W1DO_DIGITAL</span>;
  return (
    <footer className="app-footer">
      <StudioCard />
      <p className="m-0 text-center text-caption text-text-2">
        Сделано для YouTube-канала{' '}
        {youtube ? (
          <a href={youtube} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
            {channel}
          </a>
        ) : (
          channel
        )}
      </p>
    </footer>
  );
}
