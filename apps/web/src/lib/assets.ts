/**
 * Every visual asset comes from the CMS warehouse (see assets/manifest.json).
 * Missing ones (assets/missing.json) resolve to null and render as an empty slot.
 */
const iconUrls = import.meta.glob<string>('../assets/icons/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});
const illustrationSvgs = import.meta.glob<string>('../assets/illustrations/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
});
const backgroundUrls = import.meta.glob<string>('../assets/backgrounds/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});
/** Объёмные иконки склада (decor/cta-icons/extrude): только URL для mask-image, не инлайн. */
const icon3dUrls = import.meta.glob<string>('../assets/icons3d/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});
const decorUrls = import.meta.glob<string>('../assets/decor/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

const byName = (map: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(map).map(([path, v]) => [path.split('/').pop()?.replace('.svg', '') ?? path, v]),
  );

const icons = byName(iconUrls);
const illustrations = byName(illustrationSvgs);
const backgrounds = byName(backgroundUrls);
const decor = byName(decorUrls);
const icons3d = byName(icon3dUrls);

export type IconName =
  | 'mic'
  | 'stop'
  | 'folder'
  | 'folder-open'
  | 'file'
  | 'chat'
  | 'search'
  | 'filter'
  | 'ai'
  | 'plug'
  | 'pencil'
  | 'trash'
  | 'copy'
  | 'chevron-right'
  | 'chevron-down'
  | 'like'
  | 'dislike'
  | 'code'
  | 'fish'
  | 'plane'
  | 'food'
  | 'project'
  | 'sun'
  | 'moon'
  | 'close'
  | 'plus'
  | 'check'
  | 'clock'
  | 'download'
  | 'server'
  | 'lock'
  | 'logout';

export const iconUrl = (name: IconName): string | null => icons[name] ?? null;
export const illustrationSvg = (name: 'hero' | 'empty'): string | null =>
  illustrations[name] ?? null;
export type BackgroundName =
  | 'texture'
  | 'hero-code'
  | 'grid-floor'
  | 'grid-hero'
  | 'grid-tile'
  | 'aura-blobs'
  | 'aura-orbits'
  | 'aura-blobs-soft';
export const backgroundUrl = (name: BackgroundName): string | null => backgrounds[name] ?? null;

export type Icon3DName =
  | 'capture'
  | 'stats'
  | 'recent'
  | 'folders'
  | 'projects'
  | 'mcp'
  | 'mcp-send'
  | 'main-file'
  | 'tips'
  | 'empty'
  | 'search'
  | 'love'
  | 'new-entry'
  | 'telegram';
export function icon3dUrl(name: Icon3DName): string | null {
  return icons3d[name] ?? null;
}
export const decorUrl = (name: 'decor-1' | 'decor-2'): string | null => decor[name] ?? null;

/** Domain → warehouse icon (fish is missing in the warehouse → empty slot). */
export function domainIcon(domain: string | null | undefined): IconName {
  switch (domain) {
    case 'programming':
      return 'code';
    case 'ai_assistants':
      return 'ai';
    case 'fishing':
      return 'fish';
    case 'travel':
      return 'plane';
    case 'food':
      return 'food';
    case 'project':
      return 'project';
    case 'communication':
      return 'chat';
    default:
      return 'folder';
  }
}
