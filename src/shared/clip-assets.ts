import type { SaveMode } from './types';

function trimSlashes(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function parentDirOf(relPath: string): string {
  const clean = trimSlashes(relPath);
  const idx = clean.lastIndexOf('/');
  return idx > 0 ? clean.slice(0, idx) : '';
}

function fallbackDatabaseRecordsDir(dbPath: string): string {
  const clean = trimSlashes(dbPath);
  if (!clean) return '';
  if (/\.db\.md$/i.test(clean)) {
    return clean.replace(/\.db\.md$/i, '');
  }
  return parentDirOf(clean);
}

/**
 * Resolves the Space-relative directory of the document that will actually hold
 * the clipped Markdown so uploaded assets and relative links stay aligned.
 */
export function computeClipDocDir(
  saveParams: { mode: SaveMode; dir?: string; path?: string },
  ctx?: { dailyDir?: string; databaseRecordsDir?: string },
): string {
  switch (saveParams.mode) {
    case 'create':
      return trimSlashes(saveParams.dir || '');
    case 'daily':
      return trimSlashes(ctx?.dailyDir !== undefined ? ctx.dailyDir : '日记');
    case 'append':
      return parentDirOf(saveParams.path || '');
    case 'database':
      if (ctx?.databaseRecordsDir !== undefined) {
        return trimSlashes(ctx.databaseRecordsDir);
      }
      return fallbackDatabaseRecordsDir(saveParams.path || '');
    default:
      return '';
  }
}

export function saveModeSupportsCover(saveMode: SaveMode): boolean {
  return saveMode === 'create' || saveMode === 'database';
}

/**
 * Selects only the remote image URLs that will actually be referenced by the
 * saved document (body Markdown or supported frontmatter cover) to avoid
 * uploading orphaned attachments.
 */
export function selectClipAssetUrls(opts: {
  content: string;
  pageImages: { url: string }[];
  coverUrl?: string;
  includeCover: boolean;
  saveMode: SaveMode;
}): { imageUrls: string[]; coverUrl?: string } {
  const content = opts.content || '';
  const imageUrls: string[] = [];
  const seen = new Set<string>();
  for (const img of opts.pageImages) {
    const url = img.url?.trim();
    if (!url || seen.has(url) || !/^https?:\/\//i.test(url)) continue;
    if (content.includes(url)) {
      seen.add(url);
      imageUrls.push(url);
    }
  }
  const trimmedCover = opts.coverUrl?.trim();
  const coverUrl =
    saveModeSupportsCover(opts.saveMode) && opts.includeCover && trimmedCover && /^https?:\/\//i.test(trimmedCover)
      ? trimmedCover
      : undefined;
  return { imageUrls, coverUrl };
}
