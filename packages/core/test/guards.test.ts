import { describe, expect, it } from 'vitest';
import { withPolarityLeaf } from '../src/folders/tree.js';
import { normalizeEnrichment } from '../src/preferences/normalize.js';
import { canonicalTarget, detectTargets, targetMentioned } from '../src/text/glossary.js';

const base = {
  kind: 'preference',
  statement: 'правило',
  details: null,
  polarity: 'like',
  folder_path: ['ClaudeCode'],
  domain: 'ai_assistants',
  project: null,
  applies_to: [],
  tags: ['код'],
  conditions: [],
  strength: 3,
  language: 'ru',
};

describe('voice & folder quality guards', () => {
  it('a rule always lands in a «Люблю» / «Не люблю» leaf', () => {
    expect(withPolarityLeaf(['ClaudeCode'], 'like')).toEqual(['ClaudeCode', 'Люблю']);
    expect(withPolarityLeaf(['Проекты', 'SaaS'], 'dislike')).toEqual([
      'Проекты',
      'SaaS',
      'Не люблю',
    ]);
    expect(withPolarityLeaf(['X', 'Люблю'], 'dislike')).toEqual(['X', 'Не люблю']);
    expect(normalizeEnrichment(base).folder_path).toEqual(['ClaudeCode', 'Люблю']);
  });

  it('transliterated names keep their target; a named target the model skipped is extracted', () => {
    expect(canonicalTarget('Claude Code')).toBe('claude_code');
    expect(canonicalTarget('ChatGPT')).toBe('chatgpt');
    expect(targetMentioned('когда клауды-коды пишут кратко', 'claude_code')).toBe(true);
    expect(detectTargets('деплою через Dokploy на Laravel')).toEqual(['laravel', 'dokploy']);
    const text = 'люблю, когда клауды-коды задают вопросы перед реализацией';
    expect(
      normalizeEnrichment({ ...base, applies_to: ['claude_code'] }, { sourceText: text })
        .applies_to,
    ).toEqual(['claude_code']);
    expect(
      normalizeEnrichment({ ...base, applies_to: [] }, { sourceText: text }).applies_to,
    ).toEqual(['claude_code']);
    // invented tech is still dropped
    expect(
      normalizeEnrichment({ ...base, applies_to: ['react'] }, { sourceText: text }).applies_to,
    ).toEqual(['claude_code']);
  });

  it('a general CI rule filed under an unnamed project goes to «Деплой и CI»', () => {
    const e = normalizeEnrichment(
      { ...base, domain: 'devops', project: 'SaaS', folder_path: ['Проекты', 'SaaS', 'Люблю'] },
      { sourceText: 'для меня важно, чтобы каждый проект сразу настраивался CI/CD в GitLab' },
    );
    expect(e.project).toBeNull();
    expect(e.folder_path).toEqual(['Деплой и CI', 'Люблю']);
    expect(e.applies_to).toEqual(['gitlab']);
  });
});
