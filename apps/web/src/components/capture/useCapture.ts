/**
 * Логика hero «Голос → память»: запись (useRecorder), Whisper, обогащение, превью.
 * Общая для микрофона в hero и мобильного дока; вёрстка — CaptureCard и components/capture/*.
 */
import { useCallback, useState } from 'react';
import { extensionFor, useRecorder } from '../../hooks/useRecorder';
import { api } from '../../lib/api';
import type { FolderNode, Preview } from '../../lib/types';
import { useToast } from '../Toasts';

export const STEPS = ['Запись', 'Whisper', 'Обогащение', 'Индексация'] as const;
export type Step = 0 | 1 | 2 | 3 | null;
export type PreviewState = { p: Preview; source: 'voice' | 'text'; folders: FolderNode[] };

export const mmss = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export function useCapture() {
  const toast = useToast();
  const [step, setStep] = useState<Step>(null);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const enrich = useCallback(
    async (value: string, source: 'voice' | 'text') => {
      setStep(2);
      try {
        const [p, f] = await Promise.all([api.preview(value), api.folders()]);
        setStep(3);
        setPreview({ p, source, folders: f.tree });
      } catch (e) {
        toast((e as Error).message, 'error');
        setStep(null);
      }
    },
    [toast],
  );

  const onAudio = useCallback(
    async (blob: Blob, mime: string) => {
      if (blob.size === 0) return setStep(null);
      setStep(1);
      try {
        const { text: recognized } = await api.transcribe(blob, `recording.${extensionFor(mime)}`);
        setText(recognized);
        if (!recognized.trim()) {
          toast('Ничего не расслышал — попробуйте ещё раз', 'info');
          return setStep(null);
        }
        await enrich(recognized, 'voice');
      } catch (e) {
        toast((e as Error).message, 'error');
        setStep(null);
      }
    },
    [enrich, toast],
  );

  const rec = useRecorder(onAudio);
  const recording = rec.state === 'recording';
  // шаг 0 без записи (микрофон запрещён) не блокирует кнопку
  const busy = step !== null && step > 0 && preview === null;
  const activeStep: Step = recording ? 0 : step === 0 ? null : step;

  const toggle = () => {
    if (recording) rec.stop();
    else if (!busy) {
      setStep(0);
      void rec.start();
    }
  };

  const submitText = () => {
    if (text.trim() && !busy) void enrich(text.trim(), 'text');
  };

  const closePreview = () => {
    setPreview(null);
    setStep(null);
    setText('');
  };

  const hint =
    rec.state === 'denied'
      ? 'Нет доступа к микрофону'
      : rec.state === 'unsupported'
        ? 'Браузер не умеет записывать звук — введите текстом'
        : recording
          ? 'Говорите, нажмите ещё раз, чтобы остановить'
          : 'Нажмите и скажите фразу';

  return {
    rec,
    recording,
    busy,
    activeStep,
    hint,
    text,
    setText,
    toggle,
    submitText,
    preview,
    closePreview,
  };
}

export type Capture = ReturnType<typeof useCapture>;
