/**
 * Метки applies_to — к кому/чему относится правило, в любой сфере: технология, ассистент, снасть, место, человек.
 * Ничего не зашито: известные метки — те, что уже есть в памяти пользователя; новые допускаются. Сравнение
 * идёт по «сжатому» написанию и по транслиту, чтобы «ларавел» совпал с laravel, а «Claude Code» — с claude_code.
 */
import { tokenize } from './tokenize.js';

const TRANSLIT: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'i',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

export const translit = (s: string): string =>
  [...s.toLowerCase()].map((ch) => TRANSLIT[ch] ?? ch).join('');

/** Только буквы и цифры, без регистра: «Claude Code» и claude_code сравниваются как claudecode. */
export const squash = (s: string): string =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, '');

/** Каноническая форма метки: нижний регистр, пробелы и дефисы → «_» («GitLab CI» → gitlab_ci). */
export const canonicalTarget = (v: string): string =>
  v
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\s-]+/g, '_')
    .replace(/^_+|_+$/g, '');

/** Файл, путь, пакет с «/»: это не предмет правила, а деталь — место ему в тегах. */
export const looksLikePath = (v: string): boolean =>
  /[/\\]/.test(v) || /\.[a-z0-9]{1,5}$/i.test(v.trim()) || v.trim().length > 40;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordIn = (text: string, word: string) =>
  new RegExp(`(^|[^\\p{L}\\p{N}])${escape(word)}($|[^\\p{L}\\p{N}])`, 'u').test(text);

/**
 * Одна основа. Snowball не знает нерегулярных форм («дети» → дет, «детьми» → детьм), поэтому русская основа
 * может продолжать другую на 1–2 буквы; «код» и «кодекс», git и github так не совпадут.
 */
function sameStem(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return (
    /[а-я]/.test(short) &&
    short.length >= 3 &&
    long.startsWith(short) &&
    long.length - short.length <= 2
  );
}

/**
 * Метка названа в тексте — как есть, транслитом или в другой форме слова (основы Snowball: «дети» ↔ «с детьми»);
 * короткие (≤ 4 букв) без основ — только отдельным словом, чтобы git не нашёлся в «digital».
 */
export function targetMentioned(text: string, target: string): boolean {
  const needle = squash(target);
  if (!needle) return false;
  const lower = text.toLowerCase().replace(/ё/g, 'е');
  const variants = [lower, translit(lower)];
  const stems = tokenize(target.replace(/_/g, ' '));
  const hit = (words: string[]) => stems.every((s) => words.some((w) => sameStem(s, w)));
  if (stems.length && variants.some((v) => hit(tokenize(v)))) return true;
  if (needle.length > 4) return variants.some((v) => squash(v).includes(needle));
  const word = target.toLowerCase().replace(/_/g, ' ');
  return variants.some((v) => wordIn(v, word));
}

/**
 * Известные метки, прямо названные в тексте. Более общая, чьё имя входит в более конкретную
 * (claude в claude_code, gitlab в gitlab_ci), не добавляется, если названа конкретная.
 */
export function detectTargets(text: string, known: string[]): string[] {
  const found = known.filter((t) => targetMentioned(text, t));
  return found.filter((t) => !found.some((o) => o !== t && squash(o).includes(squash(t))));
}
