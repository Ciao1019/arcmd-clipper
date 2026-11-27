import { Readability } from '@mozilla/readability';
import type { ExtractedImage, ExtractedPage, WebHighlight } from '../shared/types';
import { normalizeUrl, resolveUrl } from '../shared/urlnorm';

function getMeta(doc: Document, selectors: string[]): string {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (!el) continue;
    const val = el.getAttribute('content') || el.getAttribute('datetime') || el.textContent || '';
    const trimmed = val.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function readJsonLd(doc: Document): { author?: string; published?: string; image?: string; description?: string } {
  const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
  for (const s of scripts) {
    try {
      const data = JSON.parse(s.textContent || '') as Record<string, unknown> | Record<string, unknown>[];
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const graph = Array.isArray(item['@graph']) ? (item['@graph'] as Record<string, unknown>[]) : [item];
        for (const node of graph) {
          if (!node || typeof node !== 'object') continue;
          const out: { author?: string; published?: string; image?: string; description?: string } = {};
          const authorVal = node.author;
          if (typeof authorVal === 'string') {
            out.author = authorVal.trim();
          } else if (Array.isArray(authorVal) && authorVal.length > 0) {
            const first = authorVal[0] as Record<string, unknown> | string;
            out.author = typeof first === 'string' ? first.trim() : String(first?.name || '').trim();
          } else if (authorVal && typeof authorVal === 'object') {
            out.author = String((authorVal as Record<string, unknown>).name || '').trim();
          }
          if (typeof node.datePublished === 'string') out.published = node.datePublished.trim();
          if (typeof node.description === 'string') out.description = node.description.trim();
          const img = node.image;
          if (typeof img === 'string') out.image = img.trim();
          else if (Array.isArray(img) && typeof img[0] === 'string') out.image = img[0].trim();
          else if (img && typeof img === 'object' && typeof (img as Record<string, unknown>).url === 'string') {
            out.image = String((img as Record<string, unknown>).url).trim();
          }
          if (out.author || out.published || out.image || out.description) return out;
        }
      }
    } catch {
      // ignore malformed json-ld blocks
    }
  }
  return {};
}

function normalizeLazyImages(root: ParentNode, baseUrl: string): void {
  const imgs = Array.from(root.querySelectorAll('img'));
  for (const img of imgs) {
    const candidates = [
      img.getAttribute('data-src'),
      img.getAttribute('data-actualsrc'),
      img.getAttribute('data-original'),
      img.getAttribute('data-lazy-src'),
      img.getAttribute('src'),
    ];
    let chosen = '';
    for (const c of candidates) {
      const trimmed = c?.trim() || '';
      if (!trimmed) continue;
      if (trimmed.startsWith('data:image/svg+xml') && trimmed.length < 400) continue;
      if (trimmed.startsWith('data:image/gif;base64,R0lGOD')) continue;
      chosen = resolveUrl(trimmed, baseUrl);
      break;
    }
    if (chosen) {
      img.setAttribute('src', chosen);
    }
  }
}

function preserveStructuredElements(doc: Document): void {
  // 1. Preserve GFM task list checkboxes before Readability strips <input> elements.
  doc.querySelectorAll('li').forEach((li) => {
    const cb = li.querySelector(':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]') as HTMLInputElement | null;
    if (!cb) return;
    const checked = cb.checked || cb.hasAttribute('checked');
    const marker = doc.createElement('span');
    marker.setAttribute('data-arcmd-task', checked ? 'x' : ' ');
    marker.textContent = checked ? '[x] ' : '[ ] ';
    cb.replaceWith(marker);
  });

  // 2. Preserve code fence languages across Readability sanitization.
  const langPat = /(?:^|\s)(?:language-|lang-|highlight-source-|brush:\s*)([a-zA-Z0-9_+#.-]+)/;
  doc.querySelectorAll('pre').forEach((pre) => {
    const code = pre.querySelector('code');
    const sources = [
      code?.getAttribute('data-lang'),
      code?.getAttribute('data-language'),
      pre.getAttribute('data-lang'),
      pre.getAttribute('data-language'),
      code?.getAttribute('class'),
      pre.getAttribute('class'),
    ];
    for (const s of sources) {
      if (!s) continue;
      const m = s.match(langPat);
      const lang = m?.[1] || (!s.includes(' ') && /^[a-zA-Z0-9_+#.-]{1,24}$/.test(s) && !s.startsWith('hljs') ? s : '');
      if (lang) {
        pre.setAttribute('data-arcmd-lang', lang.toLowerCase());
        if (code) code.setAttribute('data-arcmd-lang', lang.toLowerCase());
        break;
      }
    }
  });

  // 3. Keep empty data-formula/data-tex nodes non-empty so Readability does not prune them.
  doc.querySelectorAll('[data-formula], [data-tex]').forEach((el) => {
    const tex = (el.getAttribute('data-formula') || el.getAttribute('data-tex') || '').trim();
    if (tex && !el.textContent?.trim()) {
      el.textContent = tex;
    }
  });
}

function preprocessSiteClone(clone: Document, domain: string, baseUrl: string): {
  forcedContentHtml?: string;
  titleOverride?: string;
  authorOverride?: string;
  publishedOverride?: string;
  siteOverride?: string;
} {
  // Always strip our own highlighter UI host if present.
  clone.getElementById('arcmd-clipper-host')?.remove();
  clone.getElementById('arcmd-clipper-hl-style')?.remove();
  preserveStructuredElements(clone);

  // WeChat Official Account articles (mp.weixin.qq.com)
  if (domain === 'mp.weixin.qq.com' || domain.endsWith('.weixin.qq.com')) {
    const content = clone.querySelector('#js_content');
    if (content) {
      normalizeLazyImages(content, baseUrl);
      content.querySelectorAll('[style*="display: none"], [style*="display:none"]').forEach((el) => el.remove());
      return {
        forcedContentHtml: content.innerHTML,
        titleOverride: clone.querySelector('#activity-name')?.textContent?.trim() || undefined,
        authorOverride:
          clone.querySelector('#js_name')?.textContent?.trim() ||
          clone.querySelector('.rich_media_meta_text')?.textContent?.trim() ||
          undefined,
        publishedOverride: clone.querySelector('#publish_time')?.textContent?.trim() || undefined,
        siteOverride: '微信公众号',
      };
    }
  }

  // Zhihu columns & Q&A
  if (domain === 'zhihu.com' || domain.endsWith('.zhihu.com')) {
    // Normalize Zhihu formula nodes before Readability strips empty spans/imgs.
    clone.querySelectorAll('[data-formula], [data-tex], .ztext-math').forEach((el) => {
      const tex = (el.getAttribute('data-formula') || el.getAttribute('data-tex') || el.textContent || '').trim();
      if (!tex) return;
      const span = clone.createElement('span');
      span.setAttribute('data-formula', tex);
      span.textContent = tex;
      el.replaceWith(span);
    });
    const post = clone.querySelector('.Post-RichTextContainer, .RichContent-inner, article');
    if (post) {
      normalizeLazyImages(post, baseUrl);
      post.querySelectorAll('noscript, .Catalog, .RichContent-actions').forEach((el) => el.remove());
      return {
        forcedContentHtml: post.innerHTML,
        titleOverride:
          clone.querySelector('h1.Post-Title, h1.QuestionHeader-title')?.textContent?.trim() || undefined,
        authorOverride:
          clone.querySelector('.AuthorInfo-name, .UserLink-link')?.textContent?.trim() || undefined,
        siteOverride: '知乎',
      };
    }
  }

  // GitHub README / Issue / Discussion
  if (domain === 'github.com' || domain.endsWith('.github.com')) {
    const markdownBody = clone.querySelector('article.markdown-body, .comment-body.markdown-body');
    if (markdownBody) {
      const copy = markdownBody.cloneNode(true) as Element;
      normalizeLazyImages(copy, baseUrl);
      copy.querySelectorAll('a.anchor, .octicon-link, clipboard-copy').forEach((el) => el.remove());
      return {
        forcedContentHtml: copy.innerHTML,
        siteOverride: 'GitHub',
      };
    }
  }

  normalizeLazyImages(clone, baseUrl);
  return {};
}

function isSkippableImageUrl(url: string): boolean {
  if (!url) return true;
  if (!/^https?:\/\//i.test(url)) return true;
  const lower = url.toLowerCase();
  if (lower.endsWith('.svg') || lower.includes('.svg?')) return true;
  if (lower.includes('1x1') || lower.includes('pixel.gif') || lower.includes('spacer.gif')) return true;
  return false;
}

function collectImagesFromHtml(html: string, baseUrl: string, coverUrl: string): ExtractedImage[] {
  const out: ExtractedImage[] = [];
  const seen = new Set<string>();

  if (coverUrl && !isSkippableImageUrl(coverUrl)) {
    seen.add(coverUrl);
    out.push({ url: coverUrl, alt: 'cover', isCover: true });
  }

  if (!html.trim()) return out;
  const parser = new DOMParser();
  const parsed = parser.parseFromString(html, 'text/html');
  const imgs = Array.from(parsed.querySelectorAll('img'));
  for (const img of imgs) {
    const rawSrc =
      img.getAttribute('data-src') ||
      img.getAttribute('data-actualsrc') ||
      img.getAttribute('data-original') ||
      img.getAttribute('src') ||
      '';
    const resolved = resolveUrl(rawSrc.trim(), baseUrl);
    if (isSkippableImageUrl(resolved) || seen.has(resolved)) continue;
    const w = Number.parseInt(img.getAttribute('width') || '', 10);
    const h = Number.parseInt(img.getAttribute('height') || '', 10);
    if ((w > 0 && w <= 24) || (h > 0 && h <= 24)) continue;
    seen.add(resolved);
    out.push({
      url: resolved,
      alt: (img.getAttribute('alt') || '').trim(),
    });
  }
  return out;
}

export function extractSelectionFromWindow(win: Window): { html: string; text: string } {
  const sel = win.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
    return { html: '', text: '' };
  }
  const container = win.document.createElement('div');
  for (let i = 0; i < sel.rangeCount; i++) {
    const frag = sel.getRangeAt(i).cloneContents();
    container.appendChild(frag);
  }
  // Strip any highlighter UI nodes accidentally inside selection
  container.querySelectorAll('#arcmd-clipper-host').forEach((n) => n.remove());
  return {
    html: container.innerHTML.trim(),
    text: sel.toString().trim(),
  };
}

export function extractFromDocument(
  doc: Document,
  url: string,
  opts?: {
    selectionHtml?: string;
    selectionText?: string;
    highlights?: WebHighlight[];
    highlighterActive?: boolean;
  },
): ExtractedPage {
  let domain = '';
  try {
    domain = new URL(url).hostname.toLowerCase();
  } catch {
    domain = '';
  }

  const ld = readJsonLd(doc);
  const clone = doc.cloneNode(true) as Document;
  const siteHints = preprocessSiteClone(clone, domain, url);

  let readable: ReturnType<Readability['parse']> = null;
  if (!siteHints.forcedContentHtml) {
    try {
      const reader = new Readability(clone, { keepClasses: true });
      readable = reader.parse();
    } catch {
      readable = null;
    }
  }

  const rawBodyFallback = (): string => {
    const main = clone.querySelector('article, main, [role="main"]') || clone.body;
    if (!main) return '';
    const c = main.cloneNode(true) as Element;
    c.querySelectorAll('script, style, noscript, nav, footer, aside, #arcmd-clipper-host').forEach((n) => n.remove());
    return c.innerHTML;
  };

  const articleHtml = (siteHints.forcedContentHtml || readable?.content || rawBodyFallback()).trim();

  const title =
    siteHints.titleOverride ||
    getMeta(doc, ['meta[property="og:title"]', 'meta[name="twitter:title"]']) ||
    readable?.title?.trim() ||
    doc.title?.trim() ||
    domain ||
    'Untitled';

  const author =
    siteHints.authorOverride ||
    getMeta(doc, [
      'meta[name="author"]',
      'meta[property="article:author"]',
      'meta[name="twitter:creator"]',
    ]) ||
    ld.author ||
    readable?.byline?.trim() ||
    '';

  const published =
    siteHints.publishedOverride ||
    getMeta(doc, [
      'meta[property="article:published_time"]',
      'meta[name="pubdate"]',
      'meta[name="publishdate"]',
      'meta[name="date"]',
      'time[datetime]',
    ]) ||
    ld.published ||
    '';

  const siteName =
    siteHints.siteOverride ||
    getMeta(doc, ['meta[property="og:site_name"]']) ||
    readable?.siteName?.trim() ||
    domain;

  const description =
    getMeta(doc, [
      'meta[property="og:description"]',
      'meta[name="description"]',
      'meta[name="twitter:description"]',
    ]) ||
    ld.description ||
    readable?.excerpt?.trim() ||
    '';

  const rawCover =
    getMeta(doc, ['meta[property="og:image"]', 'meta[name="twitter:image"]']) || ld.image || '';
  let cover = rawCover ? resolveUrl(rawCover, url) : '';
  if (isSkippableImageUrl(cover)) cover = '';

  const images = collectImagesFromHtml(articleHtml, url, cover);
  if (!cover && images.length > 0) {
    cover = images[0].url;
    images[0].isCover = true;
  }

  return {
    url,
    normalizedUrl: normalizeUrl(url),
    domain,
    title,
    author,
    published,
    siteName,
    description,
    cover,
    articleHtml,
    selectionHtml: opts?.selectionHtml ?? '',
    selectionText: opts?.selectionText ?? '',
    images,
    highlights: opts?.highlights ?? [],
    highlighterActive: Boolean(opts?.highlighterActive),
  };
}
