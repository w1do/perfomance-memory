// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- untyped CJS package, local ambient types
/// <reference path="./snowball-stemmers.d.ts" />
import snowball from 'snowball-stemmers';

const ru = snowball.newStemmer('russian');
const en = snowball.newStemmer('english');

const STOPWORDS = new Set([
  // ru
  'и',
  'в',
  'во',
  'на',
  'с',
  'со',
  'к',
  'ко',
  'по',
  'за',
  'из',
  'от',
  'до',
  'о',
  'об',
  'у',
  'а',
  'но',
  'или',
  'же',
  'ли',
  'бы',
  'то',
  'это',
  'как',
  'что',
  'чтобы',
  'когда',
  'где',
  'там',
  'тут',
  'я',
  'мне',
  'меня',
  'мой',
  'моя',
  'мои',
  'он',
  'она',
  'они',
  'мы',
  'вы',
  'ты',
  'его',
  'ее',
  'их',
  'так',
  'уже',
  'еще',
  'очень',
  'все',
  'всё',
  'весь',
  'при',
  'для',
  'без',
  'над',
  'под',
  'не',
  'ни',
  'да',
  'нет',
  'был',
  'была',
  'было',
  'быть',
  'есть',
  // en
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'for',
  'with',
  'is',
  'are',
  'be',
  'it',
  'this',
  'that',
  'i',
  'me',
  'my',
  'when',
  'not',
  'do',
  'does',
  'at',
  'by',
  'as',
]);

const CYRILLIC = /[а-я]/;

function stem(word: string): string {
  if (/^\d+$/.test(word)) return word;
  return CYRILLIC.test(word) ? ru.stem(word) : en.stem(word);
}

/** Lowercase, split by non-letters, drop stop words, stem (Russian/English snowball). */
export function tokenize(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0);
  const out: string[] = [];
  for (const w of words) {
    if (STOPWORDS.has(w)) continue;
    if (w.length < 2 && !/^\d$/.test(w)) continue;
    out.push(stem(w));
  }
  return out;
}
