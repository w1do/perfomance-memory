import { describe, expect, it } from 'vitest';
import { withPolarityLeaf } from '../src/folders/tree.js';
import { normalizeEnrichment } from '../src/preferences/normalize.js';
import { canonicalTarget, detectTargets, targetMentioned } from '../src/text/targets.js';

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

  it('labels come from the data, in any sphere; a known label the model skipped is extracted', () => {
    expect(canonicalTarget('Claude Code')).toBe('claude_code');
    expect(canonicalTarget('GitLab CI')).toBe('gitlab_ci');
    expect(targetMentioned('пишу на ларавел', 'laravel')).toBe(true); // транслит
    expect(detectTargets('деплою через Dokploy на Laravel', ['laravel', 'dokploy', 'php'])).toEqual(
      ['laravel', 'dokploy'],
    );
    expect(detectTargets('Claude Code пишет', ['claude', 'claude_code'])).toEqual(['claude_code']);
    const fishing = normalizeEnrichment(
      { ...base, applies_to: ['Спиннинг'] },
      { sourceText: 'на рыбалке люблю ловить на спиннинг' },
    );
    expect(fishing.applies_to).toEqual(['спиннинг']);
    // модель поправила написание в statement — метка засчитывается
    const text = 'люблю, когда клауды-коды задают вопросы перед реализацией';
    const said = { ...base, statement: 'Claude Code задаёт вопросы' };
    expect(
      normalizeEnrichment({ ...said, applies_to: ['claude_code'] }, { sourceText: text })
        .applies_to,
    ).toEqual(['claude_code']);
    expect(
      normalizeEnrichment(
        { ...said, applies_to: [] },
        { sourceText: text, knownTargets: ['claude_code', 'php'] },
      ).applies_to,
    ).toEqual(['claude_code']);
    // выдуманное не проходит
    expect(
      normalizeEnrichment({ ...said, applies_to: ['react'] }, { sourceText: text }).applies_to,
    ).toEqual([]);
  });

  it('a general CI rule filed under an unnamed project goes to «Деплой и CI»', () => {
    const e = normalizeEnrichment(
      { ...base, domain: 'devops', project: 'SaaS', folder_path: ['Проекты', 'SaaS', 'Люблю'] },
      {
        sourceText: 'для меня важно, чтобы каждый проект сразу настраивался CI/CD в GitLab',
        knownTargets: ['gitlab', 'php'],
      },
    );
    expect(e.project).toBeNull();
    expect(e.folder_path).toEqual(['Деплой и CI', 'Люблю']);
    expect(e.applies_to).toEqual(['gitlab']);
  });
});
