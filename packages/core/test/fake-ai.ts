import type {
  AiProvider,
  ConflictCandidate,
  ConflictDecision,
  ConflictInput,
  EnrichInput,
  TaskContext,
} from '../src/ai/provider.js';
import { tokenize } from '../src/text/tokenize.js';
import { tokenIndex } from '../src/text/bm25.js';
import type { Enrichment } from '../src/types.js';

/** Deterministic bag-of-stems embedding: texts sharing words are close. */
export function hashEmbed(text: string, dim: number): number[] {
  const v = new Array<number>(dim).fill(0);
  for (const t of tokenize(text)) v[tokenIndex(t) % dim] = (v[tokenIndex(t) % dim] ?? 0) + 1;
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

/** OpenAI stand-in for tests: scripted enrichments, heuristic conflict decisions. */
export class FakeAi implements AiProvider {
  readonly scripts = new Map<string, Partial<Enrichment>>();
  readonly tasks = new Map<string, TaskContext>();
  lastEnrichInput: EnrichInput | null = null;
  conflictCalls: { input: ConflictInput; candidates: ConflictCandidate[] }[] = [];

  constructor(readonly dim = 64) {}

  script(text: string, e: Partial<Enrichment>): this {
    this.scripts.set(text, e);
    return this;
  }

  async transcribe(): Promise<string> {
    return 'не люблю, когда ChatGPT отвечает грубо';
  }

  async enrich(input: EnrichInput): Promise<unknown> {
    this.lastEnrichInput = input;
    const e = this.scripts.get(input.text);
    if (!e) throw new Error(`FakeAi: no script for «${input.text}»`);
    return {
      kind: 'preference',
      details: null,
      project: null,
      applies_to: [],
      tags: [],
      constraints: [],
      strength: 3,
      language: 'ru',
      ...e,
    };
  }

  async decideConflict(
    input: ConflictInput,
    candidates: ConflictCandidate[],
  ): Promise<ConflictDecision> {
    this.conflictCalls.push({ input, candidates });
    const dup = candidates.find(
      (c) => c.statement === input.statement && c.polarity === input.polarity,
    );
    if (dup) return { decision: 'duplicate', target_id: dup.id, reason: 'то же самое' };
    // like a real model: a conflict needs the same subject, not just the opposite polarity
    const words = new Set(tokenize(input.statement));
    const opposite = candidates.find(
      (c) => c.polarity !== input.polarity && tokenize(c.statement).some((t) => words.has(t)),
    );
    if (opposite)
      return { decision: 'conflict', target_id: opposite.id, reason: 'оценка сменилась' };
    return { decision: 'new', target_id: null, reason: 'новое' };
  }

  async classifyTask(task: string): Promise<TaskContext> {
    return this.tasks.get(task) ?? { domains: [], project: null, applies_to: [] };
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => hashEmbed(t, this.dim));
  }
}
