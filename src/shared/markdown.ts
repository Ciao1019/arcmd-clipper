import TurndownService from 'turndown';
import { resolveUrl } from './urlnorm';

export interface MarkdownConvertOptions {
  baseUrl: string;
  imageMap?: Record<string, string>;
}

const LANG_CLASS_PATTERNS = [
  /(?:^|\s)language-([a-zA-Z0-9_+#.-]+)/,
  /(?:^|\s)lang-([a-zA-Z0-9_+#.-]+)/,
  /(?:^|\s)highlight-source-([a-zA-Z0-9_+#.-]+)/,
  /(?:^|\s)brush:\s*([a-zA-Z0-9_+#.-]+)/,
];

const ARCMD_HIGHLIGHT_MAP: Record<string, { name: string; hex: string }> = {
  green: { name: 'light-green', hex: '#CCF3C8' },
  'light-green': { name: 'light-green', hex: '#CCF3C8' },
  blue: { name: 'light-blue', hex: '#D8E4FF' },
  'light-blue': { name: 'light-blue', hex: '#D8E4FF' },
  pink: { name: 'light-red', hex: '#FBBFBC' },
  red: { name: 'light-red', hex: '#FBBFBC' },
  'light-red': { name: 'light-red', hex: '#FBBFBC' },
  purple: { name: 'light-purple', hex: '#E2D2FC' },
  'light-purple': { name: 'light-purple', hex: '#E2D2FC' },
};

/**
 * Formats an inline highlight using ArcMD's lossless `data-highlight` + inline
 * CSS fallback (matches `internal/editor/mdstyle.go`). Yellow uses semantic `<mark>`.
 */
export function formatArcmdHighlight(text: string, color?: string): string {
  const key = (color || '').trim().toLowerCase();
  const mapped = key ? ARCMD_HIGHLIGHT_MAP[key] : undefined;
  if (!mapped) {
    return `<mark>${text}</mark>`;
  }
  return `<mark style="background-color:${mapped.hex}" data-highlight="${mapped.name}">${text}</mark>`;
}

function detectCodeLanguage(el: Element): string {
  const explicitAttrs = [
    el.getAttribute('data-arcmd-lang'),
    el.getAttribute('data-lang'),
    el.getAttribute('data-language'),
    el.parentElement?.getAttribute('data-arcmd-lang'),
    el.parentElement?.getAttribute('data-lang'),
    el.parentElement?.getAttribute('data-language'),
  ];
  for (const attr of explicitAttrs) {
    const trimmed = attr?.trim();
    if (trimmed && /^[a-zA-Z0-9_+#.-]{1,24}$/.test(trimmed)) {
      return trimmed.toLowerCase();
    }
  }
  const classAttrs = [el.getAttribute('class'), el.parentElement?.getAttribute('class')];
  for (const c of classAttrs) {
    if (!c) continue;
    for (const pat of LANG_CLASS_PATTERNS) {
      const m = c.match(pat);
      if (m?.[1]) return m[1].toLowerCase();
    }
  }
  return '';
}

function escapeTableCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n+/g, ' ').trim();
}

function pickImageSource(img: Element, baseUrl: string): string {
  const attrs = ['data-src', 'data-actualsrc', 'data-original', 'data-lazy-src', 'src'];
  for (const attr of attrs) {
    const val = img.getAttribute(attr)?.trim();
    if (!val || val.startsWith('data:image/svg+xml') && val.length < 300) {
      continue;
    }
    return resolveUrl(val, baseUrl);
  }
  const srcset = img.getAttribute('srcset')?.trim();
  if (srcset) {
    const first = srcset.split(',')[0]?.trim().split(/\s+/)[0];
    if (first) return resolveUrl(first, baseUrl);
  }
  return '';
}

/**
 * Converts cleaned article or selection HTML into clean ArcMD-compatible
 * Markdown preserving GFM tables, task lists, fenced code languages, KaTeX
 * formulas, `<mark>` highlights, `<details>`, and rewritten local image paths.
 */
export function htmlToArcMarkdown(html: string, opts: MarkdownConvertOptions): string {
  if (!html || !html.trim()) return '';

  const service = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
    blankReplacement: (_content, node) => {
      if (node && node.nodeType === 1) {
        const el = node as Element;
        const tex = (el.getAttribute('data-formula') || el.getAttribute('data-tex') || '').trim();
        if (tex) {
          const isBlock = el.tagName === 'DIV' || el.tagName === 'SECTION' || tex.includes('\n');
          return isBlock ? `\n\n$$\n${tex}\n$$\n\n` : `$${tex}$`;
        }
      }
      return (node as { isBlock?: boolean })?.isBlock ? '\n\n' : '';
    },
  });

  service.remove(['script', 'style', 'noscript', 'iframe', 'template']);

  // Strikethrough
  service.addRule('strikethrough', {
    filter: ['del', 's', 'strike' as keyof HTMLElementTagNameMap],
    replacement: (content) => (content.trim() ? `~~${content}~~` : ''),
  });

  // Preserve ArcMD native `<mark>` highlights (including Clipper web highlights).
  service.addRule('arcmdHighlight', {
    filter: (node) => node.nodeName === 'MARK',
    replacement: (content, node) => {
      const trimmed = content.trim();
      if (!trimmed) return '';
      const el = node as Element;
      const color =
        el.getAttribute('data-arcmd-color') ||
        el.getAttribute('data-highlight') ||
        el.getAttribute('data-color') ||
        '';
      return formatArcmdHighlight(trimmed, color);
    },
  });

  // KaTeX / Zhihu / MathJax inline & display formulas -> `$...$` / `$$...$$`
  service.addRule('mathFormula', {
    filter: (node) => {
      if (node.nodeType !== 1) return false;
      const el = node as Element;
      if (el.hasAttribute('data-formula') || el.hasAttribute('data-tex')) return true;
      if (el.classList?.contains('katex-display') || el.classList?.contains('katex')) {
        return !!el.querySelector('annotation[encoding="application/x-tex"]');
      }
      return false;
    },
    replacement: (_content, node) => {
      const el = node as Element;
      let tex =
        el.getAttribute('data-formula') ||
        el.getAttribute('data-tex') ||
        el.querySelector('annotation[encoding="application/x-tex"]')?.textContent ||
        '';
      tex = tex.trim();
      if (!tex) return '';
      const isBlock =
        el.classList?.contains('katex-display') ||
        el.tagName === 'DIV' ||
        el.tagName === 'SECTION' ||
        tex.includes('\n');
      return isBlock ? `\n\n$$\n${tex}\n$$\n\n` : `$${tex}$`;
    },
  });

  // Fenced code blocks with language detection
  service.addRule('fencedCodeWithLang', {
    filter: (node) => {
      return node.nodeName === 'PRE' && !!node.textContent?.trim();
    },
    replacement: (_content, node) => {
      const el = node as Element;
      const codeEl = el.querySelector('code') || el;
      const lang = detectCodeLanguage(codeEl) || detectCodeLanguage(el);
      const raw = (codeEl.textContent || '').replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, '');
      const fence = raw.includes('```') ? '~~~~' : '```';
      return `\n\n${fence}${lang}\n${raw}\n${fence}\n\n`;
    },
  });

  // Task list items `- [ ]` / `- [x]` (handles both raw <input> and Readability-safe markers)
  service.addRule('taskListItem', {
    filter: (node) => {
      if (node.nodeName !== 'LI') return false;
      const el = node as Element;
      if (el.querySelector('input[type="checkbox"]') || el.querySelector('[data-arcmd-task]')) {
        return true;
      }
      const txt = (el.textContent || '').trimStart();
      return /^\[[ xX]\]\s+/.test(txt);
    },
    replacement: (content, node) => {
      const el = node as Element;
      const cb = el.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      const marker = el.querySelector('[data-arcmd-task]');
      let checked = false;
      if (cb) {
        checked = Boolean(cb.checked || cb.hasAttribute('checked'));
      } else if (marker) {
        checked = marker.getAttribute('data-arcmd-task')?.toLowerCase() === 'x';
      } else {
        checked = /^\s*\\?\[[xX]\\?\]/.test(content);
      }
      const cleaned = content.replace(/^\s*\\?\[[ xX]\\?\]\s*/, '').trim();
      return `- [${checked ? 'x' : ' '}] ${cleaned}\n`;
    },
  });

  // Images with lazy-loading fallback + localized imageMap rewriting
  service.addRule('arcmdImage', {
    filter: 'img',
    replacement: (_content, node) => {
      const el = node as Element;
      const src = pickImageSource(el, opts.baseUrl);
      if (!src) return '';
      const mapped = opts.imageMap?.[src] || src;
      const alt = (el.getAttribute('alt') || '').replace(/[\[\]\r\n]/g, ' ').trim();
      return `![${alt}](${mapped})`;
    },
  });

  // Resolve relative links cleanly
  service.addRule('resolvedLink', {
    filter: (node) => node.nodeName === 'A' && !!(node as Element).getAttribute('href'),
    replacement: (content, node) => {
      const el = node as Element;
      const href = el.getAttribute('href') || '';
      if (!content.trim()) return '';
      if (href.startsWith('#') || href.startsWith('javascript:')) return content;
      const resolved = resolveUrl(href, opts.baseUrl);
      return `[${content}](${resolved})`;
    },
  });

  // GFM Tables
  service.addRule('gfmTable', {
    filter: 'table',
    replacement: (_content, node) => {
      const table = node as Element;
      const rows = Array.from(table.querySelectorAll('tr'));
      if (rows.length === 0) return '';
      const matrix: string[][] = [];
      let maxCols = 0;
      for (const tr of rows) {
        const cells = Array.from(tr.children).filter(
          (c) => c.tagName === 'TH' || c.tagName === 'TD',
        );
        if (cells.length === 0) continue;
        const vals = cells.map((cell) => escapeTableCell(service.turndown(cell.innerHTML)));
        maxCols = Math.max(maxCols, vals.length);
        matrix.push(vals);
      }
      if (matrix.length === 0 || maxCols === 0) return '';
      const pad = (row: string[]) => {
        const out = [...row];
        while (out.length < maxCols) out.push('');
        return `| ${out.join(' | ')} |`;
      };
      const header = pad(matrix[0]);
      const sep = `| ${Array(maxCols).fill('---').join(' | ')} |`;
      const body = matrix.slice(1).map(pad);
      return `\n\n${[header, sep, ...body].join('\n')}\n\n`;
    },
  });

  // Preserve `<details>` disclosures supported natively by ArcMD
  service.addRule('detailsDisclosure', {
    filter: 'details',
    replacement: (_content, node) => {
      const el = node as Element;
      const summaryEl = el.querySelector('summary');
      const summaryText = summaryEl?.textContent?.trim() || 'Details';
      const clone = el.cloneNode(true) as Element;
      clone.querySelector('summary')?.remove();
      const innerMd = service.turndown(clone.innerHTML).trim();
      return `\n\n<details>\n<summary>${summaryText}</summary>\n\n${innerMd}\n\n</details>\n\n`;
    },
  });

  const md = service.turndown(html);
  return md
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
