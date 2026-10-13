/** Общие типы этапа записи импорта: правило с готовым эмбеддингом и учёт итогов. */
import type { FolderPayload } from '../types.js';
import type { ParsedRule } from './parse.js';

export interface Prepared {
  rule: ParsedRule;
  text: string;
  dense: number[];
}

/** Учёт правил: total — всего на запись, settled — уже с итогом (создано, дубль, конфликт, ошибка). */
export interface WriteState {
  total: number;
  settled: number;
  /** папки, созданные этим импортом и уже записанные */
  created: FolderPayload[];
  /** pathKey папок, которые нужно сохранить: предки записанных правил и пустые папки пакета */
  keep: Set<string>;
  /** создать пустые папки не удалось, и их уборка тоже: папки могли остаться */
  leftover: boolean;
}
