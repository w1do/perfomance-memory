import OpenAI, { toFile } from 'openai';
import type { Config } from '../env.js';
import type { Logger } from '../logger.js';
import {
  CONFLICT_SYSTEM,
  ENRICH_SYSTEM,
  TASK_SYSTEM,
  conflictUserMessage,
  enrichUserMessage,
  taskUserMessage,
} from './prompts.js';
import type {
  AiProvider,
  ConflictCandidate,
  ConflictDecision,
  ConflictInput,
  DuplicateCandidate,
  DuplicateGroups,
  EnrichInput,
  TaskContext,
} from './provider.js';
import { DUPLICATES_SYSTEM, duplicatesJsonSchema, duplicatesUserMessage } from './duplicates.js';
import { conflictJsonSchema, enrichmentJsonSchema, taskContextJsonSchema } from './schemas.js';

interface JsonSchemaFormat {
  name: string;
  strict: boolean;
  schema: Record<string, unknown>;
}

export class OpenAiProvider implements AiProvider {
  private readonly client: OpenAI;

  constructor(
    private readonly config: Config,
    private readonly log: Logger,
  ) {
    this.client = new OpenAI({
      apiKey: config.OPENAI_API_KEY,
      baseURL: config.OPENAI_BASE_URL,
      maxRetries: 2,
      timeout: 120_000,
    });
  }

  async transcribe(
    audio: Buffer,
    filename: string,
    mimeType: string,
    prompt?: string,
  ): Promise<string> {
    const started = Date.now();
    const file = await toFile(audio, filename, { type: mimeType });
    const res = await this.client.audio.transcriptions.create({
      file,
      model: this.config.OPENAI_STT_MODEL,
      language: this.config.STT_LANGUAGE,
      ...(prompt ? { prompt } : {}),
    });
    this.log.info({ op: 'stt', ms: Date.now() - started, bytes: audio.length }, 'transcribed');
    return res.text.trim();
  }

  private async json(
    op: string,
    system: string,
    user: string,
    format: JsonSchemaFormat,
  ): Promise<unknown> {
    const started = Date.now();
    const res = await this.client.chat.completions.create({
      model: this.config.OPENAI_LLM_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_schema', json_schema: format },
    });
    const msg = res.choices[0]?.message;
    if (!msg?.content) {
      throw new Error(`LLM не вернула ответ (${op})${msg?.refusal ? `: ${msg.refusal}` : ''}`);
    }
    this.log.info(
      { op, ms: Date.now() - started, model: this.config.OPENAI_LLM_MODEL },
      'llm call',
    );
    return JSON.parse(msg.content) as unknown;
  }

  enrich(input: EnrichInput): Promise<unknown> {
    return this.json(
      'enrich',
      ENRICH_SYSTEM,
      enrichUserMessage(input),
      enrichmentJsonSchema as unknown as JsonSchemaFormat,
    );
  }

  async decideConflict(
    input: ConflictInput,
    candidates: ConflictCandidate[],
  ): Promise<ConflictDecision> {
    const raw = (await this.json(
      'conflict',
      CONFLICT_SYSTEM,
      conflictUserMessage(input, candidates),
      conflictJsonSchema as unknown as JsonSchemaFormat,
    )) as ConflictDecision;
    return raw;
  }

  async groupDuplicates(rules: DuplicateCandidate[]): Promise<DuplicateGroups> {
    return (await this.json(
      'duplicates',
      DUPLICATES_SYSTEM,
      duplicatesUserMessage(rules),
      duplicatesJsonSchema as unknown as JsonSchemaFormat,
    )) as DuplicateGroups;
  }

  async classifyTask(task: string, domains: string[], projects: string[]): Promise<TaskContext> {
    return (await this.json(
      'task_context',
      TASK_SYSTEM,
      taskUserMessage(task, domains, projects),
      taskContextJsonSchema as unknown as JsonSchemaFormat,
    )) as TaskContext;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const started = Date.now();
    const model = this.config.OPENAI_EMBED_MODEL;
    const res = await this.client.embeddings.create({
      model,
      input: texts,
      ...(model.includes('text-embedding-3') ? { dimensions: this.config.EMBED_DIM } : {}),
    });
    const vectors = [...res.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
    const dim = vectors[0]?.length ?? 0;
    if (dim !== this.config.EMBED_DIM) {
      throw new Error(
        `Модель ${model} вернула вектор размерности ${dim}, а EMBED_DIM=${this.config.EMBED_DIM}. Исправьте EMBED_DIM в .env.`,
      );
    }
    this.log.debug({ op: 'embed', ms: Date.now() - started, n: texts.length }, 'embedded');
    return vectors;
  }
}
