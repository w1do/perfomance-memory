/**
 * Hero «Скажите, что вы любите» (акцент 1): стекло, постоянная бегущая обводка, пол со сканом,
 * 3D-облачко у иллюстрации. Логика — capture/useCapture; стили — styles/hero.css (токены frost-01).
 */
import { useRef, type CSSProperties } from 'react';
import { useAsync } from '../hooks/useAsync';
import { api } from '../lib/api';
import '../styles/hero.css';
import { ExampleChips } from './capture/ExampleChips';
import { HeroDecor } from './capture/HeroDecor';
import { MicButton } from './capture/MicButton';
import { MobileMicDock } from './capture/MobileMicDock';
import { PipelineSteps } from './capture/PipelineSteps';
import { mmss, useCapture } from './capture/useCapture';
import { Icon3D } from './fx/Icon3D';
import { Illustration } from './Illustration';
import { PreviewModal } from './PreviewModal';
import { Card } from './ui/Card';
import { Tip } from './ui/Tip';

const illustrationStyle = {
  '--illustration-bg': 'color-mix(in srgb, var(--color-surface) 85%, transparent)',
} as CSSProperties & Record<`--${string}`, string>;

export function CaptureCard({ className = '', index = 1 }: { className?: string; index?: number }) {
  const c = useCapture();
  const { data: stats } = useAsync(api.stats, []);
  const first = stats?.total === 0;
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Card
      as="section"
      variant="glass"
      accent
      tone="accent"
      index={index}
      icon3d="capture"
      icon3dSize="sm"
      float
      className={`hero ${className}`}
      aria-labelledby="hero-title"
      data-recording={c.recording || undefined}
      deco={<HeroDecor />}
    >
      <div className="hero-grid">
        <div className="flex min-w-0 flex-col gap-md">
          <div className="eyebrow">Голос → память</div>
          <h1 id="hero-title" className="hero-title blur-in text-h2 md:text-h1">
            Скажите, что вы <em className="text-accent not-italic">любите</em>
          </h1>
          <p className="m-0 max-w-text text-lead text-text-2">
            Одна фраза — и правило ляжет в нужную папку, а ваши агенты будут его соблюдать.
          </p>

          <div className="hidden flex-wrap items-center gap-md md:flex">
            <MicButton capture={c} first={first} />
            <div className="flex flex-col">
              <span className="mono text-lead tabular-nums" aria-live="polite">
                {mmss(c.rec.seconds)}
              </span>
              <span className="text-caption text-text-2">{c.hint}</span>
            </div>
          </div>

          {(c.rec.state === 'denied' || c.rec.state === 'unsupported') && (
            <p className="m-0 text-caption text-text-2 md:hidden">{c.hint}</p>
          )}
          <PipelineSteps active={c.activeStep} />
        </div>

        <div className="hero-art">
          <Illustration
            name="hero"
            data-depth="md"
            className="blur-in text-text"
            style={illustrationStyle}
            label="Иллюстрация: мозг учится"
          />
          <Icon3D name="capture" placement="free" float className="hero-bubble" />
        </div>
        {/* поле и примеры — на всю ширину hero, чтобы подсказка в поле читалась целиком */}
        <div className="flex min-w-0 flex-col gap-sm md:col-span-2">
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              c.submitText();
            }}
          >
            <input
              ref={inputRef}
              className="input"
              value={c.text}
              onChange={(e) => c.setText(e.target.value)}
              placeholder="…или напишите: «не люблю, когда файл больше 100 строк»"
              aria-label="Фраза текстом"
            />
            <Tip content="Без голоса: текст сразу идёт на обогащение">
              {(t) => (
                <button
                  {...t}
                  className="btn btn-ghost shrink-0 self-start sm:self-auto"
                  disabled={!c.text.trim() || c.busy}
                >
                  Разобрать
                </button>
              )}
            </Tip>
          </form>

          <ExampleChips
            onPick={(t) => {
              c.setText(t);
              inputRef.current?.focus();
            }}
          />
        </div>
      </div>

      <MobileMicDock capture={c} first={first} />

      {c.preview && (
        <PreviewModal
          preview={c.preview.p}
          folders={c.preview.folders}
          source={c.preview.source}
          onClose={c.closePreview}
        />
      )}
    </Card>
  );
}
