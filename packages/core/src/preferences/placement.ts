/**
 * «Распределить»: общие правила заново проходят выбор папки и области — тот же конвейер, что при сохранении
 * (previewText: дерево, похожие папки, «Разное» по данным). План называет, что куда переедет; переносятся только
 * выбранные правила, после чего опустевшие папки, откуда они уехали, удаляются. Правила проектов не трогаются:
 * их папка — сам проект.
 *
 * Перенос осторожнее сохранения: переезд в «Разное» переносом не считается; тему, которой нет в дереве, заменяет
 * тема сферы из данных (topic.ts); новая папка появляется только при спасении из «Разное» и только с названием
 * сферы, а не выдуманным моделью; без темы правило остаётся на месте и меняет только область.
 */
import { ancestorsOf, joinPath, sameName, withPolarityLeaf } from '../folders/tree.js';
import { buildPreferenceFilter } from '../qdrant/filters.js';
import { MISC_FOLDER, PROJECTS_ROOT, type PreferencePayload } from '../types.js';
import type { PrefDeps } from './deps.js';
import { previewText } from './preview.js';
import { PreferenceError } from './schemas.js';
import { domainTopic } from './topic.js';
import { getOrThrow, updatePreference } from './update.js';

export interface Placement {
  id: string;
  statement: string;
  from: string[];
  to: string[];
  domain_from: string;
  domain_to: string;
}

export interface PlacementMove {
  id: string;
  to: string[];
  domain: string;
}

export interface PlaceResult {
  moved: number;
  folders_removed: number;
}

const BATCH = 5;
const NO_SUBJECT = new Set(['project', 'other']);

const isGeneral = (p: PreferencePayload) => !p.project && p.folder_path[0] !== PROJECTS_ROOT;

const phrase = (p: PreferencePayload) =>
  `${p.polarity === 'like' ? 'Люблю' : 'Не люблю'}: ${p.statement}${p.details ? `. ${p.details}` : ''}`;

export async function planPlacements(deps: PrefDeps): Promise<Placement[]> {
  const general = (await deps.store.allPreferences(buildPreferenceFilter({}))).filter(isGeneral);
  const topics = (await deps.folders.list()).filter((f) => f.depth === 1).map((f) => f.name);
  const plans: Placement[] = [];
  for (let i = 0; i < general.length; i += BATCH) {
    const found = await Promise.all(
      general.slice(i, i + BATCH).map((p) => placementOf(deps, p, topics)),
    );
    plans.push(...found.filter((x): x is Placement => x !== null));
  }
  return plans;
}

async function placementOf(
  deps: PrefDeps,
  p: PreferencePayload,
  topics: string[],
): Promise<Placement | null> {
  try {
    const { enrichment: e } = await previewText(deps, phrase(p));
    if (e.project || e.folder_path[0] === PROJECTS_ROOT || e.folder_path[0] === MISC_FOLDER)
      return null;
    const domain = NO_SUBJECT.has(e.domain) ? p.domain : e.domain;
    const to = withPolarityLeaf(await settle(deps, p, e.folder_path, domain, topics), p.polarity);
    if (joinPath(to) === joinPath(p.folder_path) && domain === p.domain) return null;
    return {
      id: p.id,
      statement: p.statement,
      from: p.folder_path,
      to,
      domain_from: p.domain,
      domain_to: domain,
    };
  } catch (err) {
    deps.log.warn({ id: p.id, err: (err as Error).message }, 'placement skipped');
    return null;
  }
}

/** Папка переноса: предложенная, если её тема есть в дереве; иначе тема сферы (новая — только из «Разное»). */
async function settle(
  deps: PrefDeps,
  p: PreferencePayload,
  proposed: string[],
  domain: string,
  topics: string[],
): Promise<string[]> {
  const known = (name: string) => topics.some((t) => sameName(t, name));
  if (known(proposed[0] ?? '')) return proposed;
  const topic = await domainTopic(deps, domain);
  if (!topic) return p.folder_path;
  if (known(topic) || p.folder_path[0] === MISC_FOLDER) return [topic, ...proposed.slice(1)];
  return p.folder_path;
}

/** Переносит правила по плану; вызывается под замком записи (HygieneService.place). */
export async function applyPlacements(
  deps: PrefDeps,
  moves: PlacementMove[],
): Promise<PlaceResult> {
  const left: string[][] = [];
  for (const move of moves) {
    const rule = await getOrThrow(deps, move.id);
    if (!isGeneral(rule) || move.to[0] === PROJECTS_ROOT)
      throw new PreferenceError('Правила проектов не переносятся', 400);
    left.push(rule.folder_path);
    await updatePreference(deps, move.id, { folder_path: move.to, domain: move.domain });
  }
  return { moved: moves.length, folders_removed: await removeEmptied(deps, left) };
}

/** Удаляет папки, откуда уехали правила, если в них ничего не осталось; глубокие — первыми. */
async function removeEmptied(deps: PrefDeps, paths: string[][]): Promise<number> {
  const candidates = [...new Set(paths.flatMap((p) => ancestorsOf(p)))]
    .filter((key) => !key.startsWith(PROJECTS_ROOT))
    .sort((a, b) => b.length - a.length);
  let removed = 0;
  for (const key of candidates) {
    const folder = (await deps.folders.list()).find((f) => joinPath(f.path) === key);
    if (!folder) continue;
    try {
      removed += (await deps.folders.remove(folder.id, false)).folders;
    } catch {
      // папка не пуста — остаётся
    }
  }
  return removed;
}
