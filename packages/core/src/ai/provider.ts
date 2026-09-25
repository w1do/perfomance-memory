import type { Constraint, Polarity } from '../types.js';

export interface EnrichInput {
  text: string;
  /** every existing folder path, joined with " / " */
  folderTree: string[];
  similarFolders: { path: string[]; score: number }[];
  knownDomains: string[];
  projects: string[];
  projectHint?: string | null | undefined;
}

export interface ConflictCandidate {
  id: string;
  statement: string;
  details: string | null;
  polarity: Polarity;
  folder_path: string[];
  constraints: Constraint[];
  strength: number;
}

export interface ConflictInput {
  statement: string;
  details: string | null;
  polarity: Polarity;
  constraints: Constraint[];
  raw_text: string;
}

export interface ConflictDecision {
  decision: 'conflict' | 'duplicate' | 'new';
  target_id: string | null;
  reason: string;
}

export interface TaskContext {
  domains: string[];
  project: string | null;
  applies_to: string[];
}

/** Everything the core needs from the model provider. Tests substitute a fake. */
export interface AiProvider {
  transcribe(audio: Buffer, filename: string, mimeType: string): Promise<string>;
  /** Returns raw JSON from the model; the caller validates and normalises it. */
  enrich(input: EnrichInput): Promise<unknown>;
  decideConflict(input: ConflictInput, candidates: ConflictCandidate[]): Promise<ConflictDecision>;
  classifyTask(task: string, domains: string[], projects: string[]): Promise<TaskContext>;
  embed(texts: string[]): Promise<number[][]>;
}
