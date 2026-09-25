import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderState = 'idle' | 'recording' | 'denied' | 'unsupported';

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

function pickMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
}

export function extensionFor(mime: string): string {
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4')) return 'm4a';
  return 'webm';
}

/** Microphone recording with a live level (0..1) for the ring and a seconds timer. */
export function useRecorder(onDone: (blob: Blob, mime: string) => void) {
  const [state, setState] = useState<RecorderState>(
    typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof MediaRecorder !== 'undefined'
      ? 'idle'
      : 'unsupported',
  );
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const refs = useRef<{
    rec?: MediaRecorder;
    stream?: MediaStream;
    ctx?: AudioContext;
    raf?: number;
    timer?: number;
    chunks: Blob[];
  }>({ chunks: [] });

  const cleanup = useCallback(() => {
    const r = refs.current;
    if (r.raf) cancelAnimationFrame(r.raf);
    if (r.timer) clearInterval(r.timer);
    r.stream?.getTracks().forEach((t) => t.stop());
    void r.ctx?.close();
    refs.current = { chunks: [] };
    setLevel(0);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    if (state === 'unsupported') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
        refs.current.raf = requestAnimationFrame(tick);
      };
      refs.current = { rec, stream, ctx, chunks: [] };
      rec.ondataavailable = (e) => e.data.size && refs.current.chunks.push(e.data);
      rec.onstop = () => {
        const type = rec.mimeType || mime || 'audio/webm';
        const blob = new Blob(refs.current.chunks, { type });
        cleanup();
        setState('idle');
        onDone(blob, type);
      };
      rec.start(250);
      setSeconds(0);
      const startedAt = Date.now();
      refs.current.timer = window.setInterval(
        () => setSeconds(Math.floor((Date.now() - startedAt) / 1000)),
        250,
      );
      tick();
      setState('recording');
    } catch {
      cleanup();
      setState('denied');
    }
  }, [state, cleanup, onDone]);

  const stop = useCallback(() => {
    if (refs.current.rec?.state === 'recording') refs.current.rec.stop();
  }, []);

  return { state, level, seconds, start, stop };
}
