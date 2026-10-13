/** Файлы схемы в браузере: чтение JSON с проверкой размера и скачивание без сети. */
export const MAX_FILE_BYTES = 9 * 1024 * 1024;

export async function readJsonFile(file: File): Promise<unknown> {
  if (file.size > MAX_FILE_BYTES) throw new Error('Файл больше 9 МБ');
  try {
    return JSON.parse(await file.text());
  } catch {
    throw new Error('Файл не читается как JSON');
  }
}

export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Имя файла из названия схемы: только буквы и цифры, до 60 знаков. */
export function schemaFileName(name: string): string {
  const base =
    name
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'schema';
  return `${base}.pm-schema.json`;
}
