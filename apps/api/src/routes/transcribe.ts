import type { FastifyInstance } from 'fastify';
import type { Core } from '@preference-memory/core';

const EXT_BY_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'video/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'm4a',
};
const ALLOWED_EXT = new Set(['webm', 'ogg', 'oga', 'mp3', 'm4a', 'mp4']);

export function transcribeRoutes(app: FastifyInstance, core: Core): void {
  app.post('/api/transcribe', async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.status(400).send({ error: 'Нет файла audio' });
    const mime = (file.mimetype.split(';')[0] ?? '').trim().toLowerCase();
    const extFromName = file.filename.split('.').pop()?.toLowerCase() ?? '';
    const ext = EXT_BY_MIME[mime] ?? (ALLOWED_EXT.has(extFromName) ? extFromName : null);
    if (!ext) {
      return reply
        .status(415)
        .send({ error: 'Формат не поддерживается: нужен webm, ogg, mp3 или m4a' });
    }
    const buffer = await file.toBuffer();
    if (file.file.truncated) {
      return reply.status(413).send({ error: `Файл больше ${core.config.MAX_AUDIO_MB} МБ` });
    }
    if (!buffer.length) return reply.status(400).send({ error: 'Пустая запись' });
    const text = await core.ai.transcribe(buffer, `recording.${ext}`, mime || `audio/${ext}`);
    return { text };
  });
}
