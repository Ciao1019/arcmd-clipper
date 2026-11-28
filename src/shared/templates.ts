import { formatArcmdHighlight } from './markdown';
import type {
  ClipAIResult,
  ClipMode,
  ClipTemplate,
  ExtractedPage,
  FrontmatterField,
  TemplateTrigger,
  WebHighlight,
} from './types';

export interface TemplateContext {
  page: ExtractedPage;
  clipMode: ClipMode;
  articleMarkdown: string;
  selectionMarkdown: string;
  coverUrl: string;
  ai?: ClipAIResult | null;
  now?: Date;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatDatePattern(date: Date, pattern: string): string {
  const yyyy = String(date.getFullYear());
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const min = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  return pattern
    .replace(/YYYY/g, yyyy)
    .replace(/MM/g, mm)
    .replace(/DD/g, dd)
    .replace(/HH/g, hh)
    .replace(/mm/g, min)
    .replace(/ss/g, ss);
}

export function formatHighlightsMarkdown(highlights: WebHighlight[]): string {
  if (!highlights || highlights.length === 0) return '';
  return highlights
    .map((h) => {
      const marked = formatArcmdHighlight(h.exact.replace(/\r?\n/g, ' '), h.color);
      const quote = `> ${marked}`;
      if (h.note && h.note.trim()) {
        return `${quote}\n>\n> *${h.note.trim()}*`;
      }
      return quote;
    })
    .join('\n\n');
}

export function buildVariables(ctx: TemplateContext): Record<string, string | string[]> {
  const now = ctx.now ?? new Date();
  const dateStr = formatDatePattern(now, 'YYYY-MM-DD');
  const timeStr = formatDatePattern(now, 'HH:mm');
  const highlightsMd = formatHighlightsMarkdown(ctx.page.highlights);
  const aiSummary = ctx.ai?.summary?.trim() ?? '';
  const aiTags = ctx.ai?.tags ?? [];

  let activeContent = ctx.articleMarkdown;
  if (ctx.clipMode === 'selection') {
    activeContent = ctx.selectionMarkdown || ctx.page.selectionText || ctx.articleMarkdown;
  } else if (ctx.clipMode === 'bookmark') {
    const desc = ctx.page.description ? `\n\n${ctx.page.description}` : '';
    activeContent = `[${ctx.page.title || ctx.page.url}](${ctx.page.url})${desc}`;
  } else if (ctx.clipMode === 'highlights') {
    activeContent = highlightsMd || `> ${ctx.page.description || ctx.page.title}`;
  }

  return {
    title: ctx.page.title || ctx.page.domain || 'Untitled Clip',
    author: ctx.page.author || '',
    published: ctx.page.published || '',
    date: dateStr,
    time: timeStr,
    datetime: `${dateStr} ${timeStr}`,
    url: ctx.page.url,
    domain: ctx.page.domain,
    site: ctx.page.siteName || ctx.page.domain,
    description: ctx.page.description || '',
    cover: ctx.coverUrl || '',
    content: activeContent,
    article: ctx.articleMarkdown,
    selection: ctx.selectionMarkdown || ctx.page.selectionText || '',
    highlights: highlightsMd,
    highlights_count: String(ctx.page.highlights.length),
    ai_summary: aiSummary,
    ai_custom: ctx.ai?.custom?.trim() ?? '',
    ai_tags: aiTags,
    tags: aiTags,
  };
}

function applyFilter(value: string | string[], filterExpr: string, now: Date): string | string[] {
  const colonIdx = filterExpr.indexOf(':');
  const name = (colonIdx >= 0 ? filterExpr.slice(0, colonIdx) : filterExpr).trim().toLowerCase();
  const arg = colonIdx >= 0 ? filterExpr.slice(colonIdx + 1) : '';
  const asStr = Array.isArray(value) ? value.join(', ') : value;

  switch (name) {
    case 'trim':
      return asStr.trim();
    case 'lower':
      return asStr.toLowerCase();
    case 'upper':
      return asStr.toUpperCase();
    case 'wikilink':
      if (Array.isArray(value)) return value.map((v) => `[[${v}]]`);
      return asStr.trim() ? `[[${asStr.trim()}]]` : '';
    case 'blockquote':
      return asStr
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
    case 'date': {
      const d = asStr ? new Date(asStr) : now;
      const valid = Number.isNaN(d.getTime()) ? now : d;
      return formatDatePattern(valid, arg || 'YYYY-MM-DD');
    }
    case 'slice': {
      const [startRaw, endRaw] = arg.split(',');
      const start = Number.parseInt(startRaw || '0', 10) || 0;
      const end = endRaw !== undefined && endRaw !== '' ? Number.parseInt(endRaw, 10) : undefined;
      return asStr.slice(start, end);
    }
    case 'replace': {
      const sep = arg.indexOf('=>') >= 0 ? '=>' : ':';
      const idx = arg.indexOf(sep);
      if (idx < 0) return asStr;
      const from = arg.slice(0, idx);
      const to = arg.slice(idx + sep.length);
      return from ? asStr.split(from).join(to) : asStr;
    }
    case 'join':
      return Array.isArray(value) ? value.join(arg || ', ') : asStr;
    default:
      return value;
  }
}

/**
 * Evaluates a template string containing `{{var}}` and chained filters such as
 * `{{title|trim|slice:0,60}}` or `{{published|date:YYYY-MM-DD}}`.
 */
export function renderTemplateString(
  template: string,
  vars: Record<string, string | string[]>,
  now = new Date(),
): string {
  return template.replace(/\{\{([^}]+?)\}\}/g, (_match, expr: string) => {
    const parts = expr.split('|');
    const key = (parts[0] || '').trim();
    if (!key || !(key in vars)) return '';
    let val: string | string[] = vars[key];
    for (let i = 1; i < parts.length; i++) {
      const rawFilter = parts[i].replace(/^\s+/, '');
      val = applyFilter(val, rawFilter, now);
    }
    return Array.isArray(val) ? val.join(', ') : val;
  });
}

export function renderFrontmatter(
  fields: FrontmatterField[],
  vars: Record<string, string | string[]>,
  now = new Date(),
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const key = field.key.trim();
    if (!key) continue;
    const rawExpr = field.value.trim();
    // Preserve native array for pure list variable expressions like `{{ai_tags}}`
    const singleVarMatch = rawExpr.match(/^\{\{\s*([a-zA-Z0-9_]+)\s*\}\}$/);
    if (field.type === 'list' && singleVarMatch && Array.isArray(vars[singleVarMatch[1]])) {
      const arr = (vars[singleVarMatch[1]] as string[]).filter((x) => x.trim() !== '');
      if (arr.length > 0) out[key] = arr;
      continue;
    }
    const rendered = renderTemplateString(rawExpr, vars, now).trim();
    if (!rendered) continue;
    switch (field.type) {
      case 'list': {
        const items = rendered
          .split(/[,，\n]/)
          .map((s) => s.trim().replace(/^#/, ''))
          .filter(Boolean);
        if (items.length > 0) out[key] = items;
        break;
      }
      case 'number': {
        const num = Number(rendered);
        if (!Number.isNaN(num)) out[key] = num;
        break;
      }
      case 'checkbox':
        out[key] = rendered === 'true' || rendered === '1' || rendered === 'yes';
        break;
      default:
        out[key] = rendered;
    }
  }
  return out;
}

export function renderDatabaseFields(
  fieldTemplates: Record<string, string> | undefined,
  vars: Record<string, string | string[]>,
  now = new Date(),
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!fieldTemplates) return out;
  for (const [key, expr] of Object.entries(fieldTemplates)) {
    const k = key.trim();
    if (!k) continue;
    const singleVarMatch = expr.trim().match(/^\{\{\s*([a-zA-Z0-9_]+)\s*\}\}$/);
    if (singleVarMatch && Array.isArray(vars[singleVarMatch[1]])) {
      const arr = (vars[singleVarMatch[1]] as string[]).filter(Boolean);
      if (arr.length > 0) out[k] = arr;
      continue;
    }
    const rendered = renderTemplateString(expr, vars, now).trim();
    if (rendered) out[k] = rendered;
  }
  return out;
}

export function matchesTrigger(trigger: TemplateTrigger, url: string, domain: string): boolean {
  const pat = trigger.pattern.trim();
  if (!pat) return false;
  switch (trigger.type) {
    case 'domain': {
      const cleanPat = pat.toLowerCase().replace(/^www\./, '');
      const cleanDomain = domain.toLowerCase().replace(/^www\./, '');
      return cleanDomain === cleanPat || cleanDomain.endsWith('.' + cleanPat);
    }
    case 'prefix':
      return url.toLowerCase().startsWith(pat.toLowerCase());
    case 'regex':
      try {
        return new RegExp(pat, 'i').test(url);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

export function pickMatchingTemplate(
  templates: ClipTemplate[],
  url: string,
  domain: string,
): { template: ClipTemplate; autoMatched: boolean } {
  for (const t of templates) {
    if (t.triggers.some((tr) => matchesTrigger(tr, url, domain))) {
      return { template: t, autoMatched: true };
    }
  }
  return { template: templates[0], autoMatched: false };
}

export function renderClipBody(template: ClipTemplate, ctx: TemplateContext): string {
  const vars = buildVariables(ctx);
  // In highlights-only mode, avoid duplicating highlights when the template
  // already renders both `{{highlights}}` and `{{content}}`.
  if (
    ctx.clipMode === 'highlights' &&
    typeof vars.highlights === 'string' &&
    vars.highlights.trim() !== '' &&
    /\{\{\s*highlights(?:\s*\|[^}]+)?\s*\}\}/.test(template.bodyTemplate)
  ) {
    vars.content = '';
  }
  let body = renderTemplateString(template.bodyTemplate, vars, ctx.now);
  // Clean up empty callouts/sections left when optional blocks (ai_summary / highlights) are blank.
  body = body
    .replace(/\n*>\s*\[!TIP\]\s*AI 摘要\s*\n>\s*(?:\n|$)/gi, '\n\n')
    .replace(/\n*##\s*网页高亮与批注\s*\n+(?=(?:---|\s*$))/g, '\n\n')
    .replace(/\n+---\s*$/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return body;
}
