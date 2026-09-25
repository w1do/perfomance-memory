import { describe, expect, it } from 'vitest';
import { cleanTags, splitTargets } from '../src/preferences/guards.js';
import { closest, levenshtein, snapPath } from '../src/text/fuzzy.js';
import { targetMentioned } from '../src/text/targets.js';

describe('typos and the applies_to dictionary', () => {
  it('snaps a misspelled name to an existing one, never a different short word', () => {
    expect(levenshtein('деплои', 'деплой')).toBe(1);
    expect(closest('Деплои и CI', ['Деплой и CI', 'Рыбалка'])).toBe('Деплой и CI');
    expect(closest('рыбалкаа', ['рыбалка'])).toBe('рыбалка');
    expect(closest('saas', ['SaaS'])).toBe('SaaS');
    expect(closest('Кот', ['Код'])).toBeNull();
    expect(closest('Не люблю', ['Люблю'])).toBeNull();
  });

  it('snaps a folder path level by level while it matches existing folders', () => {
    const known = [['Деплой и CI', 'Люблю'], ['Проекты', 'Семейный чат', 'Люблю'], ['Рыбалка']];
    expect(snapPath(['Деплои и CI', 'Люблю'], known)).toEqual(['Деплой и CI', 'Люблю']);
    expect(snapPath(['Проекты', 'Семейный чатт', 'Не люблю'], known)).toEqual([
      'Проекты',
      'Семейный чат',
      'Не люблю',
    ]);
    expect(snapPath(['Путешествия', 'Люблю'], known)).toEqual(['Путешествия', 'Люблю']);
  });

  it('any subject is a label; me/any_ai are dropped, files and paths go to tags', () => {
    expect(
      splitTargets(['PHP', 'me', 'any_ai', 'service.php', 'Спиннинг', 'spatie/laravel-data']),
    ).toEqual({
      targets: ['php', 'спиннинг'],
      extra: ['service.php', 'spatie/laravel-data'],
    });
  });

  it('labels match other word forms; short ones never inside other words', () => {
    expect(targetMentioned('студия W1DO Digital', 'git')).toBe(false);
    expect(targetMentioned('коммиты в git короткие', 'git')).toBe(true);
    expect(targetMentioned('ночные перелёты с детьми', 'дети')).toBe(true);
    expect(targetMentioned('ловить щуку на спиннинг', 'щука')).toBe(true);
    expect(cleanTags(['ночные', 'не', 'для', 'перелёты', 'не люблю'])).toEqual([
      'ночные',
      'перелёты',
    ]);
  });
});
