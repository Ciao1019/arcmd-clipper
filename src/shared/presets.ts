import type { ClipTemplate } from './types';

export const PRESET_TEMPLATES: ClipTemplate[] = [
  {
    id: 'default-article',
    name: '默认文章剪藏',
    description: '提取完整正文、元信息与高亮批注，自动本地化图片',
    triggers: [],
    clipMode: 'article',
    saveMode: 'create',
    dir: '',
    titleTemplate: '{{title}}',
    frontmatter: [
      { key: 'source', value: '{{url}}', type: 'text' },
      { key: 'author', value: '{{author}}', type: 'text' },
      { key: 'published', value: '{{published}}', type: 'text' },
      { key: 'clipped', value: '{{date}}', type: 'text' },
      { key: 'tags', value: '{{ai_tags}}', type: 'list' },
      { key: 'summary', value: '{{ai_summary}}', type: 'text' },
    ],
    bodyTemplate: `# {{title}}

> [!TIP] AI 摘要
> {{ai_summary}}

## 网页高亮与批注

{{highlights}}

---

{{content}}`,
    downloadImages: true,
    includeCover: true,
    includeHighlights: true,
    openAfterSave: false,
  },
  {
    id: 'wechat-article',
    name: '微信公众号文章',
    description: '针对 mp.weixin.qq.com 优化，自动抓取防盗链图片到本地',
    triggers: [{ type: 'domain', pattern: 'mp.weixin.qq.com' }],
    clipMode: 'article',
    saveMode: 'create',
    dir: 'Reading',
    titleTemplate: '{{title}}',
    frontmatter: [
      { key: 'source', value: '{{url}}', type: 'text' },
      { key: 'author', value: '{{author}}', type: 'text' },
      { key: 'platform', value: '微信公众号', type: 'text' },
      { key: 'clipped', value: '{{date}}', type: 'text' },
      { key: 'tags', value: '{{ai_tags}}', type: 'list' },
    ],
    bodyTemplate: `# {{title}}

> [!TIP] AI 摘要
> {{ai_summary}}

## 网页高亮与批注

{{highlights}}

---

{{content}}`,
    downloadImages: true,
    includeCover: true,
    includeHighlights: true,
    openAfterSave: false,
  },
  {
    id: 'zhihu-article',
    name: '知乎专栏 / 问答',
    description: '针对知乎自动还原懒加载图片与数学公式',
    triggers: [{ type: 'domain', pattern: 'zhihu.com' }],
    clipMode: 'article',
    saveMode: 'create',
    dir: 'Reading',
    titleTemplate: '{{title}}',
    frontmatter: [
      { key: 'source', value: '{{url}}', type: 'text' },
      { key: 'author', value: '{{author}}', type: 'text' },
      { key: 'platform', value: '知乎', type: 'text' },
      { key: 'clipped', value: '{{date}}', type: 'text' },
      { key: 'tags', value: '{{ai_tags}}', type: 'list' },
    ],
    bodyTemplate: `# {{title}}

> [!TIP] AI 摘要
> {{ai_summary}}

## 网页高亮与批注

{{highlights}}

---

{{content}}`,
    downloadImages: true,
    includeCover: true,
    includeHighlights: true,
    openAfterSave: false,
  },
  {
    id: 'github-repo',
    name: 'GitHub 项目 / Issue',
    description: '收藏开源项目 README、PR 或技术讨论',
    triggers: [{ type: 'domain', pattern: 'github.com' }],
    clipMode: 'article',
    saveMode: 'create',
    dir: 'GitHub',
    titleTemplate: '{{title}}',
    frontmatter: [
      { key: 'source', value: '{{url}}', type: 'text' },
      { key: 'site', value: 'GitHub', type: 'text' },
      { key: 'clipped', value: '{{date}}', type: 'text' },
      { key: 'tags', value: '{{ai_tags}}', type: 'list' },
    ],
    bodyTemplate: `# {{title}}

> [!NOTE] 项目链接
> [{{url}}]({{url}})
> {{description}}

> [!TIP] AI 摘要
> {{ai_summary}}

{{content}}`,
    downloadImages: true,
    includeCover: false,
    includeHighlights: true,
    openAfterSave: false,
  },
  {
    id: 'daily-bookmark',
    name: '速记到今日笔记',
    description: '将网页摘要、划选或高亮快速追加到今日笔记',
    triggers: [],
    clipMode: 'bookmark',
    saveMode: 'daily',
    dailyPosition: 'bottom',
    titleTemplate: '{{title}}',
    frontmatter: [],
    bodyTemplate: `### [{{title}}]({{url}}) ({{time}})

{{description}}

{{highlights}}`,
    downloadImages: false,
    includeCover: false,
    includeHighlights: true,
    openAfterSave: false,
  },
  {
    id: 'database-reading-list',
    name: '写入多维数据库',
    description: '直接新增一条记录到 ArcMD 的 .db.md 多维数据库',
    triggers: [],
    clipMode: 'article',
    saveMode: 'database',
    titleTemplate: '{{title}}',
    frontmatter: [],
    databaseFields: {
      url: '{{url}}',
      source: '{{url}}',
      author: '{{author}}',
      tags: '{{ai_tags}}',
      date: '{{date}}',
      summary: '{{ai_summary}}',
    },
    bodyTemplate: `> [!TIP] AI 摘要
> {{ai_summary}}

## 网页高亮与批注

{{highlights}}

---

{{content}}`,
    downloadImages: true,
    includeCover: false,
    includeHighlights: true,
    openAfterSave: false,
  },
];
