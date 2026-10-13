/** Payload новой папки: общий для ручного создания (service.ts) и импорта схемы (transfer/). */
import { randomUUID } from 'node:crypto';
import type { FolderPayload } from '../types.js';
import { ancestorsOf } from './tree.js';

export function newFolderPayload(
  name: string,
  parent: FolderPayload | null,
  domain: string | null,
  description: string | null,
): FolderPayload {
  const path = parent ? [...parent.path, name] : [name];
  return {
    id: randomUUID(),
    name,
    parent_id: parent?.id ?? null,
    path,
    ancestors: ancestorsOf(path),
    depth: path.length,
    domain,
    description,
    preference_count: 0,
    created_at: new Date().toISOString(),
  };
}
