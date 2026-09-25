/**
 * Главная: bento по областям (styles/home.css) — hero, статистика, «Как пользоваться», последние,
 * папки, проекты, PREFERENCES.md. Скрытые подсказки на <640 возвращает кнопка под bento.
 */
import { CaptureCard } from '../components/CaptureCard';
import { FoldersCard } from '../components/home/FoldersCard';
import { MainFileCard } from '../components/home/MainFileCard';
import { ProjectsCard } from '../components/home/ProjectsCard';
import { RecentCard } from '../components/home/RecentCard';
import { StatsCard } from '../components/home/StatsCard';
import { HowToCard } from '../components/onboarding/HowToCard';
import { useHints } from '../hooks/useHints';
import '../styles/home.css';

export function HomePage({ openFolder }: { openFolder: (path: string | null) => void }) {
  const { hidden, show } = useHints();
  return (
    <>
      <div className={`bento ${hidden ? 'bento--no-hints' : ''}`}>
        <CaptureCard className="area-hero" index={1} />
        <StatsCard className="area-stats" index={2} />
        {!hidden && <HowToCard className="area-hints" index={3} />}
        <RecentCard className="area-recent" index={4} onOpenFolder={openFolder} />
        <FoldersCard className="area-folders" index={5} onOpenFolder={openFolder} />
        <ProjectsCard className="area-projects" index={6} onOpenFolder={openFolder} />
        <MainFileCard className="area-main" index={7} />
      </div>
      {hidden && (
        <div className="mt-md flex justify-center sm:hidden">
          <button type="button" className="btn btn-ghost btn-sm" onClick={show}>
            Показать подсказки
          </button>
        </div>
      )}
    </>
  );
}
