import { describe, expect, it } from 'vitest';
import { PRESET_TEMPLATES } from '../src/shared/presets';
import {
  buildVariables,
  pickMatchingTemplate,
  renderClipBody,
  renderDatabaseFields,
  renderFrontmatter,
  renderTemplateString,
} from '../src/shared/templates';
import type { ExtractedPage } from '../src/shared/types';

const samplePage: ExtractedPage = {
  url: 'https://mp.weixin.qq.com/s/demo',
  normalizedUrl: 'https://mp.weixin.qq.com/s/demo',
  domain: 'mp.weixin.qq.com',
  title: '  ArcMD Pure Go Native UI  ',
  author: 'Alice',
  published: '2026-11-20T10:30:00Z',
  siteName: '微信公众号',
  description: 'Fast local Markdown workspace.',
  cover: 'https://example.com/cover.png',
  articleHtml: '<p>Hello</p>',
  selectionHtml: '<p>Selected</p>',
  selectionText: 'Selected',
  images: [],
  highlights: [
    {
      id: 'h1',
      exact: 'Native GPU rendering',
      prefix: '',
      suffix: '',
      color: 'blue',
      note: 'Great insight',
      createdAt: '2026-11-27T00:00:00Z',
    },
  ],
  highlighterActive: false,
};

describe('template engine & triggers', () => {
  it('supports chained variable filters', () => {
    const vars = {
      title: '  Hello ArcMD World  ',
      published: '2026-11-20T08:00:00Z',
      tags: ['Go', 'Clipper'],
      author: 'Alice',
    };
    expect(renderTemplateString('{{title|trim|slice:0,11|upper}}', vars)).toBe('HELLO ARCMD');
    expect(renderTemplateString('{{published|date:YYYY/MM/DD}}', vars)).toBe('2026/11/20');
    expect(renderTemplateString('{{author|wikilink}}', vars)).toBe('[[Alice]]');
    expect(renderTemplateString('{{tags|join: / }}', vars)).toBe('Go / Clipper');
    expect(renderTemplateString('{{title|trim|replace:World=>Editor}}', vars)).toBe('Hello ArcMD Editor');
  });

  it('auto-matches WeChat, Zhihu, and GitHub triggers and falls back to default', () => {
    const wechat = pickMatchingTemplate(PRESET_TEMPLATES, 'https://mp.weixin.qq.com/s/abc', 'mp.weixin.qq.com');
    expect(wechat.autoMatched).toBe(true);
    expect(wechat.template.id).toBe('wechat-article');

    const zhihu = pickMatchingTemplate(PRESET_TEMPLATES, 'https://zhuanlan.zhihu.com/p/123', 'zhuanlan.zhihu.com');
    expect(zhihu.autoMatched).toBe(true);
    expect(zhihu.template.id).toBe('zhihu-article');

    const fallback = pickMatchingTemplate(PRESET_TEMPLATES, 'https://blog.example.org/post', 'blog.example.org');
    expect(fallback.autoMatched).toBe(false);
    expect(fallback.template.id).toBe('default-article');
  });

  it('renders frontmatter types, database fields, highlights, and strips empty AI callout', () => {
    const vars = buildVariables({
      page: samplePage,
      clipMode: 'article',
      articleMarkdown: 'Body paragraph.',
      selectionMarkdown: 'Selected',
      coverUrl: samplePage.cover,
      ai: null,
      now: new Date('2026-11-27T12:00:00Z'),
    });

    const fm = renderFrontmatter(
      [
        { key: 'source', value: '{{url}}', type: 'text' },
        { key: 'tags', value: '#Go, #Native', type: 'list' },
        { key: 'rating', value: '5', type: 'number' },
        { key: 'read', value: 'true', type: 'checkbox' },
      ],
      vars,
    );
    expect(fm).toEqual({
      source: 'https://mp.weixin.qq.com/s/demo',
      tags: ['Go', 'Native'],
      rating: 5,
      read: true,
    });

    const dbFields = renderDatabaseFields({ url: '{{url}}', author: '{{author}}' }, vars);
    expect(dbFields).toEqual({ url: 'https://mp.weixin.qq.com/s/demo', author: 'Alice' });

    const body = renderClipBody(PRESET_TEMPLATES[0], {
      page: samplePage,
      clipMode: 'article',
      articleMarkdown: 'Body paragraph.',
      selectionMarkdown: 'Selected',
      coverUrl: samplePage.cover,
      ai: null,
    });
    expect(body).not.toContain('[!TIP] AI 摘要');
    expect(body).toContain('## 网页高亮与批注');
    expect(body).toContain(
      '<mark style="background-color:#D8E4FF" data-highlight="light-blue">Native GPU rendering</mark>',
    );
    expect(body).toContain('*Great insight*');
    expect(body).toContain('Body paragraph.');

    // In highlights-only mode, highlights must NOT be duplicated under both {{highlights}} and {{content}}.
    const hlOnly = renderClipBody(PRESET_TEMPLATES[0], {
      page: samplePage,
      clipMode: 'highlights',
      articleMarkdown: 'Body paragraph.',
      selectionMarkdown: 'Selected',
      coverUrl: samplePage.cover,
      ai: null,
    });
    expect(hlOnly).toContain('## 网页高亮与批注');
    expect(hlOnly.match(/Native GPU rendering/g)?.length).toBe(1);
    expect(hlOnly).not.toMatch(/\n---\s*$/);
  });
});
