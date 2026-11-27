import { describe, expect, it } from 'vitest';
import { computeClipDocDir, selectClipAssetUrls } from '../src/shared/clip-assets';

describe('clip asset directory & selection', () => {
  it('computes accurate docDir for create, daily, append, and database modes', () => {
    expect(computeClipDocDir({ mode: 'create', dir: '/Clips/Web/' })).toBe('Clips/Web');
    expect(computeClipDocDir({ mode: 'daily' }, { dailyDir: '日记' })).toBe('日记');
    expect(computeClipDocDir({ mode: 'daily' }, { dailyDir: 'Daily' })).toBe('Daily');
    expect(computeClipDocDir({ mode: 'daily' })).toBe('日记');
    expect(computeClipDocDir({ mode: 'append', path: 'Reading/Notes/Article.md' })).toBe('Reading/Notes');
    expect(computeClipDocDir({ mode: 'append', path: 'Inbox.md' })).toBe('');
    expect(
      computeClipDocDir(
        { mode: 'database', path: 'Reading/稍后阅读.db.md' },
        { databaseRecordsDir: 'Reading/稍后阅读' },
      ),
    ).toBe('Reading/稍后阅读');
    expect(
      computeClipDocDir(
        { mode: 'database', path: 'Reading/稍后阅读.db.md' },
        { databaseRecordsDir: 'Reading/Clips' },
      ),
    ).toBe('Reading/Clips');
    expect(
      computeClipDocDir(
        { mode: 'database', path: 'Reading/稍后阅读.db.md' },
        { databaseRecordsDir: '' },
      ),
    ).toBe('');
    expect(computeClipDocDir({ mode: 'database', path: 'Reading/稍后阅读.db.md' })).toBe('Reading/稍后阅读');
  });

  it('uploads only referenced images and omits cover in daily/append modes', () => {
    const pageImages = [
      { url: 'https://example.com/cover.png', isCover: true },
      { url: 'https://example.com/diagram.png' },
      { url: 'https://example.com/footer.png' },
    ];

    // Selection/highlights/bookmark with no images in content must not upload page body images.
    const sel = selectClipAssetUrls({
      content: 'Just a selected text snippet without images.',
      pageImages,
      coverUrl: 'https://example.com/cover.png',
      includeCover: true,
      saveMode: 'create',
    });
    expect(sel.imageUrls).toEqual([]);
    expect(sel.coverUrl).toBe('https://example.com/cover.png');

    // Article referencing only one of the page images uploads only that image + cover.
    const article = selectClipAssetUrls({
      content: '# Title\n\n![diagram](https://example.com/diagram.png)',
      pageImages,
      coverUrl: 'https://example.com/cover.png',
      includeCover: true,
      saveMode: 'create',
    });
    expect(article.imageUrls).toEqual(['https://example.com/diagram.png']);
    expect(article.coverUrl).toBe('https://example.com/cover.png');

    // Daily and append modes never save frontmatter cover, so coverUrl must be omitted.
    for (const saveMode of ['daily', 'append'] as const) {
      const res = selectClipAssetUrls({
        content: '![diagram](https://example.com/diagram.png)',
        pageImages,
        coverUrl: 'https://example.com/cover.png',
        includeCover: true,
        saveMode,
      });
      expect(res.imageUrls).toEqual(['https://example.com/diagram.png']);
      expect(res.coverUrl).toBeUndefined();
    }

    // Database mode supports record frontmatter cover when includeCover is enabled.
    const dbRes = selectClipAssetUrls({
      content: 'Plain summary without inline images.',
      pageImages,
      coverUrl: 'https://example.com/cover.png',
      includeCover: true,
      saveMode: 'database',
    });
    expect(dbRes.imageUrls).toEqual([]);
    expect(dbRes.coverUrl).toBe('https://example.com/cover.png');
  });
});
