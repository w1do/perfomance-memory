/**
 * Конвейер hero: пилюли шагов (Запись → Whisper → Обогащение → Индексация) с подсказками Tip
 * и соединители, которые дорисовываются (draw, scaleX) по мере прохождения. Стили — capture/steps.css.
 */
import { useStatus } from '../../hooks/useStatus';
import { Tip } from '../ui/Tip';
import { STEPS, type Step } from './useCapture';
import './steps.css';

export function PipelineSteps({ active }: { active: Step }) {
  const { data } = useStatus();
  const tips = [
    'Одна мысль за раз: что любите или нет и где это применять',
    data ? `Речь → текст, модель ${data.models.stt}` : 'Речь → текст',
    'Модель раскладывает фразу на поля и ничего не добавляет от себя',
    'Смысл и точные слова в Qdrant — агент найдёт правило любым запросом',
  ];
  return (
    <ol className="steps" aria-label="Этапы обработки">
      {STEPS.map((s, i) => {
        const done = (active !== null && i < active) || undefined;
        return (
          <li key={s} className="steps__item">
            <Tip content={tips[i]}>
              {(t) => (
                <span
                  {...t}
                  className="step"
                  aria-current={active === i ? 'step' : undefined}
                  data-done={done}
                >
                  {s}
                </span>
              )}
            </Tip>
            {i < STEPS.length - 1 && (
              <span aria-hidden="true" className="step-link" data-done={done} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
