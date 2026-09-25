import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const MAIN_FILE = 'PREFERENCES.md';

/** Atomic write of the main file into the data directory. */
export async function writeMainFile(dataDir: string, markdown: string): Promise<string> {
  await mkdir(dataDir, { recursive: true });
  const target = join(dataDir, MAIN_FILE);
  const tmp = `${target}.${process.pid}.tmp`;
  await writeFile(tmp, markdown, 'utf8');
  await rename(tmp, target);
  return target;
}
