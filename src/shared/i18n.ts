export type Locale = 'zh-CN' | 'en';

const EN: Record<string, string> = {
  'ArcMD Clipper': 'ArcMD Clipper',
  '已连接 ArcMD': 'Connected',
  '离线直写模式': 'Headless Ready',
  '未连接 ArcMD': 'Not Connected',
  '连接中…': 'Connecting…',
  '网页高亮': 'Highlight',
  '高亮中': 'Highlighting',
  '设置': 'Settings',
  '整篇正文': 'Article',
  '划选内容': 'Selection',
  '书签卡片': 'Bookmark',
  '仅高亮': 'Highlights',
  '模板': 'Template',
  '域名自动匹配': 'Auto-matched',
  '空间': 'Space',
  '方式': 'Save As',
  '新建文档': 'New Note',
  '今日笔记': 'Daily Note',
  '追加文档': 'Append Note',
  '多维数据库': 'Database',
  '目录': 'Folder',
  '根目录': 'Root folder',
  '位置': 'Position',
  '末尾追加': 'Append bottom',
  '顶部插入': 'Insert top',
  '目标文档': 'Target Note',
  '数据库': 'Database',
  '标题': 'Title',
  'AI 摘要与标签': 'AI Summary & Tags',
  '生成中…': 'Generating…',
  '复用 ArcMD 本机模型': 'Uses ArcMD AI config',
  '请先在 ArcMD 设置 › AI 中配置模型与 Key': 'Configure AI model & key in ArcMD Settings › AI first',
  '下载图片到本地': 'Download images locally',
  '包含封面图': 'Include cover image',
  '保存后打开': 'Open after save',
  '置顶': 'Pin',
  '收藏': 'Favorite',
  '预览与编辑': 'Preview & Edit',
  '正文 Markdown': 'Markdown Body',
  '属性 / 字段': 'Properties / Fields',
  '保存到 ArcMD': 'Save to ArcMD',
  '正在下载图片': 'Downloading images',
  '正在保存…': 'Saving…',
  '该页面已剪藏过': 'Already clipped in ArcMD',
  '尚未检测到 ArcMD 宿主连接': 'ArcMD Native Host Not Detected',
  '请在 ArcMD「设置 › AI › 浏览器剪藏」中点击「一键安装连接」，然后重新打开此弹窗。':
    'Open ArcMD → Settings → AI → Web Clipper and click "Install Host", then reopen this popup.',
  '打开设置与诊断': 'Open Setup & Diagnostics',
  '已保存': 'Saved',
  '张图片已本地化': 'image(s) localized',
  '张图片回退外链': 'kept as remote URL',
  '当前页面无选区': 'No text selected on page',
  '暂无数据库': 'No databases in this Space',
};

let currentLocale: Locale = 'zh-CN';

export function setLocale(pref: 'auto' | 'zh-CN' | 'en'): Locale {
  if (pref === 'zh-CN' || pref === 'en') {
    currentLocale = pref;
    return currentLocale;
  }
  const navLang = typeof navigator !== 'undefined' ? navigator.language || '' : '';
  currentLocale = navLang.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
  return currentLocale;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function t(zh: string): string {
  if (currentLocale === 'zh-CN') return zh;
  return EN[zh] ?? zh;
}
