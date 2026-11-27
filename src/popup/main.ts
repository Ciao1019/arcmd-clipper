import { setLocale, t } from '../shared/i18n';
import { htmlToArcMarkdown } from '../shared/markdown';
import { defaultSettings, loadSettings } from '../shared/storage';
import {
  buildVariables,
  pickMatchingTemplate,
  renderClipBody,
  renderDatabaseFields,
  renderFrontmatter,
  renderTemplateString,
} from '../shared/templates';
import type {
  ClipAIResult,
  ClipCheckURLResult,
  ClipContextResult,
  ClipDatabaseContext,
  ClipMode,
  ClipSaveParams,
  ClipSpaceContext,
  ClipTemplate,
  ExecuteClipProgress,
  ExecuteClipResponse,
  ExtensionSettings,
  ExtractedPage,
  InsertPosition,
  SaveMode,
} from '../shared/types';

interface PopupState {
  settings: ExtensionSettings;
  context: ClipContextResult | null;
  hostMissing: boolean;
  hostError: string;
  page: ExtractedPage | null;
  activeTabId?: number;
  clipMode: ClipMode;
  saveMode: SaveMode;
  templateId: string;
  autoMatched: boolean;
  spaceId: string;
  dir: string;
  spaceTemplate: string;
  dailyPosition: InsertPosition;
  appendDoc: string;
  appendPosition: InsertPosition;
  databasePath: string;
  dbFieldValues: Record<string, unknown>;
  title: string;
  body: string;
  bodyManuallyEdited: boolean;
  ai: ClipAIResult | null;
  aiLoading: boolean;
  downloadImages: boolean;
  includeCover: boolean;
  openAfterSave: boolean;
  pin: boolean;
  favorite: boolean;
  saving: boolean;
  articleMarkdown: string;
  selectionMarkdown: string;
}

const isExtensionEnv = typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

async function sendBg<T>(msg: Record<string, unknown>): Promise<T> {
  if (!isExtensionEnv) {
    throw new Error('Not running in extension context');
  }
  return (await chrome.runtime.sendMessage(msg)) as T;
}

function buildDemoFixtures(): {
  context: ClipContextResult;
  page: ExtractedPage;
  dup: ClipCheckURLResult;
} {
  return {
    context: {
      version: '0.5.0',
      protocol: 1,
      live: true,
      activeSpaceId: 'sp-work',
      aiReady: true,
      aiModel: 'gpt-4.1-mini',
      spaces: [
        {
          id: 'sp-work',
          name: 'Work & Research',
          icon: '💼',
          active: true,
          folders: ['Reading', 'Architecture', 'GitHub'],
          templates: ['文章笔记', '读书卡片'],
          docs: ['Inbox.md', 'Reading/Native UI Architecture.md'],
          databases: [
            {
              path: 'Reading/稍后阅读.db.md',
              title: '稍后阅读',
              icon: '📚',
              properties: [
                { id: 'p_url', key: 'url', name: '来源链接', type: 'url' },
                {
                  id: 'p_stage',
                  key: 'stage',
                  name: '阅读进度',
                  type: 'select',
                  options: [
                    { id: 'o1', name: '待精读', color: 'blue' },
                    { id: 'o2', name: '已完成', color: 'green' },
                  ],
                },
                { id: 'p_tags', key: 'tags', name: '标签', type: 'multi_select' },
                { id: 'p_done', key: 'starred', name: '精选', type: 'checkbox' },
              ],
            },
          ],
        },
        {
          id: 'sp-personal',
          name: 'Personal',
          icon: '🌿',
          active: false,
          folders: ['Journal', 'Clips'],
          templates: [],
          docs: ['Scratchpad.md'],
          databases: [],
        },
      ],
    },
    page: {
      url: 'https://mp.weixin.qq.com/s/arcmd-pure-go-native-ui',
      normalizedUrl: 'https://mp.weixin.qq.com/s/arcmd-pure-go-native-ui',
      domain: 'mp.weixin.qq.com',
      title: '纯 Go 原生 GPU 渲染：如何不用 Electron 打造 120Hz 富文本编辑器',
      author: 'ArcMD 工程团队',
      published: '2026-11-26',
      siteName: '微信公众号',
      description: '深度拆解 ArcMD 如何以纯 Go + MyGo 构建零 webview、零 CGO 的多维知识库与富文本引擎。',
      cover: 'https://mmbiz.qpic.cn/demo/cover.png',
      articleHtml:
        '<p>使用纯 Go 直接绘制 GPU 界面，可以在 20MB 二进制内实现 120Hz 流畅排版。</p><pre><code class="language-go">func main() { mygo.Run(app.View) }</code></pre><p><img src="https://mmbiz.qpic.cn/demo/arch.png" alt="架构图"/></p>',
      selectionHtml: '',
      selectionText: '',
      images: [
        { url: 'https://mmbiz.qpic.cn/demo/cover.png', alt: 'cover', isCover: true },
        { url: 'https://mmbiz.qpic.cn/demo/arch.png', alt: '架构图' },
      ],
      highlights: [
        {
          id: 'hl-1',
          exact: '在 20MB 二进制内实现 120Hz 流畅排版',
          prefix: '可以',
          suffix: '。',
          color: 'yellow',
          note: '关键架构亮点',
          createdAt: '2026-11-27T08:00:00Z',
        },
      ],
      highlighterActive: false,
    },
    dup: {
      normalizedUrl: 'https://mp.weixin.qq.com/s/arcmd-pure-go-native-ui',
      matches: [
        {
          spaceId: 'sp-work',
          spaceName: 'Work & Research',
          path: 'Reading/稍后阅读.db.md',
          title: '稍后阅读',
          kind: 'database',
          recordTitle: '纯 Go 原生 GPU 渲染',
        },
      ],
    },
  };
}

const state: PopupState = {
  settings: defaultSettings(),
  context: null,
  hostMissing: false,
  hostError: '',
  page: null,
  clipMode: 'article',
  saveMode: 'create',
  templateId: 'default-article',
  autoMatched: false,
  spaceId: '',
  dir: '',
  spaceTemplate: '',
  dailyPosition: 'bottom',
  appendDoc: '',
  appendPosition: 'bottom',
  databasePath: '',
  dbFieldValues: {},
  title: '',
  body: '',
  bodyManuallyEdited: false,
  ai: null,
  aiLoading: false,
  downloadImages: true,
  includeCover: true,
  openAfterSave: false,
  pin: false,
  favorite: false,
  saving: false,
  articleMarkdown: '',
  selectionMarkdown: '',
};

function currentTemplate(): ClipTemplate {
  return (
    state.settings.templates.find((tpl) => tpl.id === state.templateId) ||
    state.settings.templates[0]
  );
}

function currentSpace(): ClipSpaceContext | undefined {
  return (
    state.context?.spaces.find((s) => s.id === state.spaceId) ||
    state.context?.spaces.find((s) => s.active) ||
    state.context?.spaces[0]
  );
}

function currentDatabase(): ClipDatabaseContext | undefined {
  const sp = currentSpace();
  if (!sp || sp.databases.length === 0) return undefined;
  return sp.databases.find((d) => d.path === state.databasePath) || sp.databases[0];
}

function buildTemplateContext() {
  if (!state.page) return null;
  const coverUrl = state.includeCover ? state.page.cover : '';
  return {
    page: state.page,
    clipMode: state.clipMode,
    articleMarkdown: state.articleMarkdown,
    selectionMarkdown: state.selectionMarkdown,
    coverUrl,
    ai: state.ai,
  };
}

function recomputeRenderedOutputs(forceBody = false): void {
  const ctx = buildTemplateContext();
  const tpl = currentTemplate();
  if (!ctx || !tpl) return;

  const vars = buildVariables(ctx);
  if (!state.title || forceBody) {
    state.title = renderTemplateString(tpl.titleTemplate || '{{title}}', vars).trim() || state.page?.title || '';
    byId<HTMLInputElement>('inp-title').value = state.title;
  }

  if (forceBody || !state.bodyManuallyEdited) {
    state.body = renderClipBody(tpl, ctx);
    byId<HTMLTextAreaElement>('txt-body').value = state.body;
    state.bodyManuallyEdited = false;
    byId('btn-reset-body').classList.add('hidden');
  }

  // Pre-fill database field values from template expressions if empty or refreshed
  if (forceBody) {
    const renderedDb = renderDatabaseFields(tpl.databaseFields, vars);
    state.dbFieldValues = { ...renderedDb };
    renderDatabasePropertiesUI();
  }

  renderMetaPreview();
}

function computeFrontmatter(): Record<string, unknown> {
  const ctx = buildTemplateContext();
  const tpl = currentTemplate();
  if (!ctx || !tpl) return {};
  return renderFrontmatter(tpl.frontmatter, buildVariables(ctx));
}

function renderMetaPreview(): void {
  const pre = byId<HTMLPreElement>('pre-meta');
  if (state.saveMode === 'database') {
    pre.textContent = JSON.stringify(state.dbFieldValues, null, 2);
    return;
  }
  const fm = computeFrontmatter();
  const keys = Object.keys(fm);
  if (keys.length === 0) {
    pre.textContent = '# (无 Frontmatter 属性)';
    return;
  }
  const lines = ['---'];
  for (const [k, v] of Object.entries(fm)) {
    if (Array.isArray(v)) {
      lines.push(`${k}: [${v.map((x) => JSON.stringify(x)).join(', ')}]`);
    } else {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    }
  }
  lines.push('---');
  pre.textContent = lines.join('\n');
}

function renderConnectionBadge(): void {
  const badge = byId('conn-badge');
  const label = byId('conn-label');
  const errCard = byId('host-error-card');
  badge.className = 'conn-badge';

  if (state.hostMissing) {
    badge.classList.add('offline');
    label.textContent = t('未连接 ArcMD');
    errCard.classList.remove('hidden');
    if (state.hostError) {
      byId('host-error-desc').textContent =
        `${t('请在 ArcMD「设置 › AI › 浏览器剪藏」中点击「一键安装连接」，然后重新打开此弹窗。')} (${state.hostError})`;
    }
    byId<HTMLButtonElement>('btn-save').disabled = true;
    return;
  }

  errCard.classList.add('hidden');
  if (!state.context) {
    badge.classList.add('connecting');
    label.textContent = t('连接中…');
    return;
  }
  if (state.context.live) {
    badge.classList.add('live');
    label.textContent = `${t('已连接 ArcMD')} v${state.context.version}`;
  } else {
    badge.classList.add('headless');
    label.textContent = `${t('离线直写模式')} v${state.context.version}`;
  }
  byId<HTMLButtonElement>('btn-save').disabled = state.saving || !state.page;
}

function renderTemplatesDropdown(): void {
  const sel = byId<HTMLSelectElement>('sel-template');
  sel.innerHTML = '';
  for (const tpl of state.settings.templates) {
    const opt = document.createElement('option');
    opt.value = tpl.id;
    opt.textContent = tpl.name;
    sel.appendChild(opt);
  }
  sel.value = state.templateId;
  byId('auto-match-badge').classList.toggle('hidden', !state.autoMatched);
}

function renderSpacesDropdown(): void {
  const sel = byId<HTMLSelectElement>('sel-space');
  sel.innerHTML = '';
  if (!state.context || state.context.spaces.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '—';
    sel.appendChild(opt);
    return;
  }
  for (const sp of state.context.spaces) {
    const opt = document.createElement('option');
    opt.value = sp.id;
    opt.textContent = `${sp.icon ? sp.icon + ' ' : ''}${sp.name}`;
    sel.appendChild(opt);
  }
  const active = currentSpace();
  if (active) {
    state.spaceId = active.id;
    sel.value = active.id;
  }
  renderSpaceDependentControls();
}

function renderSpaceDependentControls(): void {
  const sp = currentSpace();

  // Folder suggestions
  const dl = byId<HTMLDataListElement>('dir-suggestions');
  dl.innerHTML = '';
  if (sp) {
    for (const folder of sp.folders) {
      const opt = document.createElement('option');
      opt.value = folder;
      dl.appendChild(opt);
    }
  }
  byId<HTMLInputElement>('inp-dir').value = state.dir;

  // Space templates (.arcmd/templates)
  const tplSel = byId<HTMLSelectElement>('sel-space-template');
  tplSel.innerHTML = `<option value="">不使用</option>`;
  if (sp) {
    for (const name of sp.templates) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      tplSel.appendChild(opt);
    }
  }
  tplSel.value = state.spaceTemplate;

  // Append target doc
  const docSel = byId<HTMLSelectElement>('sel-append-doc');
  docSel.innerHTML = '';
  if (sp && sp.docs.length > 0) {
    for (const p of sp.docs) {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      docSel.appendChild(opt);
    }
    if (!sp.docs.includes(state.appendDoc)) {
      state.appendDoc = sp.docs[0];
    }
    docSel.value = state.appendDoc;
  } else {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '暂无文档';
    docSel.appendChild(opt);
    state.appendDoc = '';
  }

  // Database selector
  const dbSel = byId<HTMLSelectElement>('sel-database');
  dbSel.innerHTML = '';
  if (sp && sp.databases.length > 0) {
    for (const db of sp.databases) {
      const opt = document.createElement('option');
      opt.value = db.path;
      opt.textContent = `${db.icon ? db.icon + ' ' : ''}${db.title} (${db.path})`;
      dbSel.appendChild(opt);
    }
    if (!sp.databases.some((d) => d.path === state.databasePath)) {
      state.databasePath = sp.databases[0].path;
    }
    dbSel.value = state.databasePath;
  } else {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = t('暂无数据库');
    dbSel.appendChild(opt);
    state.databasePath = '';
  }

  renderDatabasePropertiesUI();
}

function renderDatabasePropertiesUI(): void {
  const container = byId('db-fields-container');
  container.innerHTML = '';
  const db = currentDatabase();
  if (!db) {
    const p = document.createElement('p');
    p.className = 'muted-hint';
    p.textContent = t('暂无数据库');
    container.appendChild(p);
    return;
  }

  const editable = db.properties.filter((p) => !p.readOnly);
  for (const prop of editable) {
    const row = document.createElement('div');
    row.className = 'db-prop-row';

    const key = prop.key || prop.id;
    const fieldId = `db-prop-${(prop.id || key).replace(/[^a-zA-Z0-9_-]/g, '_')}`;

    const label = document.createElement('label');
    label.className = 'db-prop-label';
    label.htmlFor = fieldId;
    label.textContent = prop.name || prop.key;
    label.title = `${prop.name} (${prop.key} · ${prop.type})`;
    row.appendChild(label);

    const curVal = state.dbFieldValues[key] ?? state.dbFieldValues[prop.name] ?? '';

    if (prop.type === 'checkbox') {
      const cb = document.createElement('input');
      cb.id = fieldId;
      cb.name = key;
      cb.type = 'checkbox';
      cb.checked = Boolean(curVal);
      cb.addEventListener('change', () => {
        state.dbFieldValues[key] = cb.checked;
        renderMetaPreview();
      });
      row.appendChild(cb);
    } else if (prop.type === 'select' && prop.options && prop.options.length > 0) {
      const sel = document.createElement('select');
      sel.id = fieldId;
      sel.name = key;
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = '— 未选择 —';
      sel.appendChild(blank);
      for (const opt of prop.options) {
        const o = document.createElement('option');
        o.value = opt.name;
        o.textContent = opt.name;
        sel.appendChild(o);
      }
      sel.value = typeof curVal === 'string' ? curVal : '';
      sel.addEventListener('change', () => {
        if (sel.value) state.dbFieldValues[key] = sel.value;
        else delete state.dbFieldValues[key];
        renderMetaPreview();
      });
      row.appendChild(sel);
    } else {
      const inp = document.createElement('input');
      inp.id = fieldId;
      inp.name = key;
      inp.type =
        prop.type === 'number'
          ? 'number'
          : prop.type === 'date'
            ? 'date'
            : prop.type === 'url'
              ? 'url'
              : 'text';
      if (Array.isArray(curVal)) {
        inp.value = curVal.join(', ');
      } else {
        inp.value = curVal === undefined || curVal === null ? '' : String(curVal);
      }
      if (prop.type === 'multi_select') {
        inp.placeholder = '逗号分隔多个标签';
      } else if (prop.type === 'url') {
        inp.placeholder = 'https://…';
      }
      inp.addEventListener('input', () => {
        const v = inp.value.trim();
        if (!v) {
          delete state.dbFieldValues[key];
        } else if (prop.type === 'multi_select') {
          state.dbFieldValues[key] = v
            .split(/[,，]/)
            .map((s) => s.trim())
            .filter(Boolean);
        } else if (prop.type === 'number') {
          const n = Number(v);
          state.dbFieldValues[key] = Number.isNaN(n) ? v : n;
        } else {
          state.dbFieldValues[key] = v;
        }
        renderMetaPreview();
      });
      row.appendChild(inp);
    }

    container.appendChild(row);
  }
}

function updateSaveModeVisibility(): void {
  byId('dest-create').classList.toggle('hidden', state.saveMode !== 'create');
  byId('dest-daily').classList.toggle('hidden', state.saveMode !== 'daily');
  byId('dest-append').classList.toggle('hidden', state.saveMode !== 'append');
  byId('dest-database').classList.toggle('hidden', state.saveMode !== 'database');
  byId('row-title').classList.toggle('hidden', state.saveMode === 'daily' || state.saveMode === 'append');
  byId('wrap-pin').classList.toggle('hidden', state.saveMode !== 'create');
  byId('wrap-fav').classList.toggle('hidden', state.saveMode !== 'create');
  byId<HTMLSelectElement>('sel-save-mode').value = state.saveMode;
  renderMetaPreview();
}

function updateClipModeUI(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-clip-mode]').forEach((btn) => {
    const mode = btn.dataset.clipMode as ClipMode;
    btn.classList.toggle('active', mode === state.clipMode);
    if (mode === 'selection') {
      const hasSel = Boolean(state.page?.selectionText?.trim());
      btn.disabled = !hasSel;
      btn.title = hasSel ? '' : t('当前页面无选区');
    }
  });
  const hlCount = state.page?.highlights.length ?? 0;
  const pill = byId('hl-count-pill');
  pill.textContent = String(hlCount);
  pill.classList.toggle('hidden', hlCount === 0);
}

function renderAIUI(): void {
  const btn = byId<HTMLButtonElement>('btn-ai');
  const chip = byId('ai-model-chip');
  const hint = byId('ai-hint');
  const out = byId('ai-output');

  const ready = Boolean(state.context?.aiReady);
  if (state.context?.aiModel) {
    chip.textContent = state.context.aiModel;
    chip.classList.remove('hidden');
  } else {
    chip.classList.add('hidden');
  }

  btn.disabled = state.aiLoading || !ready || !state.page;
  btn.textContent = state.aiLoading ? t('生成中…') : state.ai ? '重新生成' : '生成摘要';

  if (state.context && !ready) {
    hint.textContent = t('请先在 ArcMD 设置 › AI 中配置模型与 Key');
    hint.classList.remove('hidden');
  } else {
    hint.classList.add('hidden');
  }

  if (state.ai && (state.ai.summary || state.ai.tags.length > 0)) {
    out.classList.remove('hidden');
    byId('ai-summary-text').textContent = state.ai.summary || '';
    const tagsWrap = byId('ai-tags-wrap');
    tagsWrap.innerHTML = '';
    for (const tag of state.ai.tags) {
      const pill = document.createElement('span');
      pill.className = 'tag-pill';
      pill.textContent = `#${tag}`;
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'tag-remove';
      rm.textContent = '×';
      rm.addEventListener('click', () => {
        if (!state.ai) return;
        state.ai = { ...state.ai, tags: state.ai.tags.filter((x) => x !== tag) };
        renderAIUI();
        recomputeRenderedOutputs(false);
      });
      pill.appendChild(rm);
      tagsWrap.appendChild(pill);
    }
  } else {
    out.classList.add('hidden');
  }
}

function applyTemplate(tpl: ClipTemplate, autoMatched: boolean, forceTemplateClipMode = false): void {
  state.templateId = tpl.id;
  state.autoMatched = autoMatched;
  state.saveMode = tpl.saveMode;
  if (tpl.spaceId && state.context?.spaces.some((s) => s.id === tpl.spaceId)) {
    state.spaceId = tpl.spaceId;
  }
  state.dir = tpl.dir || '';
  state.dailyPosition = tpl.dailyPosition || 'bottom';
  state.appendPosition = tpl.appendPosition || 'bottom';
  if (tpl.targetPath) {
    if (tpl.saveMode === 'database') state.databasePath = tpl.targetPath;
    else if (tpl.saveMode === 'append') state.appendDoc = tpl.targetPath;
  }
  state.downloadImages = tpl.downloadImages;
  state.includeCover = tpl.includeCover;
  state.openAfterSave = tpl.openAfterSave ?? state.settings.defaultOpenAfterSave;

  // Keep `selection` active on initial open whenever the user selected text on the page.
  if (forceTemplateClipMode || !state.page?.selectionText?.trim()) {
    state.clipMode = tpl.clipMode;
  }

  byId<HTMLInputElement>('chk-images').checked = state.downloadImages;
  byId<HTMLInputElement>('chk-cover').checked = state.includeCover;
  byId<HTMLInputElement>('chk-open').checked = state.openAfterSave;
  byId<HTMLSelectElement>('sel-daily-pos').value = state.dailyPosition;
  byId<HTMLSelectElement>('sel-append-pos').value = state.appendPosition;

  renderTemplatesDropdown();
  renderSpacesDropdown();
  updateClipModeUI();
  updateSaveModeVisibility();
  recomputeRenderedOutputs(true);
}

function renderDuplicateBanner(dup: ClipCheckURLResult | null): void {
  const banner = byId('dup-banner');
  const list = byId('dup-list');
  if (!dup || dup.matches.length === 0) {
    banner.classList.add('hidden');
    return;
  }
  list.innerHTML = '';
  for (const m of dup.matches.slice(0, 3)) {
    const line = document.createElement('div');
    const detail = m.kind === 'database' ? `${m.title} › ${m.recordTitle || m.path}` : m.path;
    line.textContent = `• ${m.spaceName} / ${detail}`;
    list.appendChild(line);
  }
  if (dup.matches.length > 3) {
    const more = document.createElement('div');
    more.textContent = `…以及另外 ${dup.matches.length - 3} 处记录`;
    list.appendChild(more);
  }
  banner.classList.remove('hidden');
}

function renderHighlighterButton(): void {
  const btn = byId('btn-highlight');
  const label = byId('btn-highlight-label');
  const active = Boolean(state.page?.highlighterActive);
  const count = state.page?.highlights.length ?? 0;
  btn.classList.toggle('active', active);
  label.textContent = active
    ? `${t('高亮中')}${count > 0 ? ` (${count})` : ''}`
    : `${t('网页高亮')}${count > 0 ? ` (${count})` : ''}`;
}

async function runAI(): Promise<void> {
  if (!state.page || state.aiLoading) return;
  state.aiLoading = true;
  renderAIUI();
  try {
    if (!isExtensionEnv) {
      state.ai = {
        summary: '本文介绍了 ArcMD 如何基于纯 Go 与 MyGo 实现零 webview 的 120Hz 原生富文本引擎。',
        tags: ['Go', 'NativeUI', 'ArcMD'],
        model: 'gpt-4.1-mini',
      };
    } else {
      const resp = await sendBg<{ ok: boolean; result?: ClipAIResult; error?: string }>({
        type: 'native.call',
        action: 'clip.ai',
        params: {
          title: state.title || state.page.title,
          url: state.page.url,
          content: state.body || state.articleMarkdown,
          mode: 'both',
          customPrompt: currentTemplate().aiPrompt || '',
        },
      });
      if (resp.ok && resp.result) {
        state.ai = resp.result;
      } else {
        byId('ai-hint').textContent = resp.error || 'AI 生成失败';
        byId('ai-hint').classList.remove('hidden');
      }
    }
    if (state.ai) {
      recomputeRenderedOutputs(false);
      // Merge AI tags into database fields if database has a tags/multi_select field
      const db = currentDatabase();
      if (db && state.ai.tags.length > 0) {
        for (const prop of db.properties) {
          if (prop.type === 'multi_select' && (!state.dbFieldValues[prop.key] || (state.dbFieldValues[prop.key] as string[]).length === 0)) {
            state.dbFieldValues[prop.key] = [...state.ai.tags];
            break;
          }
        }
        renderDatabasePropertiesUI();
      }
    }
  } finally {
    state.aiLoading = false;
    renderAIUI();
  }
}

async function handleSave(): Promise<void> {
  if (state.saving || !state.page || !state.context) return;
  const sp = currentSpace();
  if (!sp) return;

  state.saving = true;
  byId<HTMLButtonElement>('btn-save').disabled = true;
  byId('result-banner').classList.add('hidden');
  byId('progress-wrap').classList.remove('hidden');
  byId('progress-label').textContent = state.downloadImages ? t('正在下载图片') : t('正在保存…');
  byId('progress-pct').textContent = '0%';
  byId<HTMLDivElement>('progress-bar').style.width = '12%';

  const saveParams: ClipSaveParams = {
    space: sp.id,
    mode: state.saveMode,
    title: state.title.trim() || state.page.title,
    content: byId<HTMLTextAreaElement>('txt-body').value,
    open: state.openAfterSave,
  };

  if (state.saveMode === 'create') {
    saveParams.dir = state.dir.trim();
    saveParams.frontmatter = computeFrontmatter();
    if (state.includeCover && state.page.cover) saveParams.cover = state.page.cover;
    if (state.spaceTemplate) saveParams.template = state.spaceTemplate;
    saveParams.pin = state.pin;
    saveParams.favorite = state.favorite;
  } else if (state.saveMode === 'daily') {
    saveParams.dailyPosition = state.dailyPosition;
  } else if (state.saveMode === 'append') {
    saveParams.path = state.appendDoc;
    saveParams.appendPosition = state.appendPosition;
  } else if (state.saveMode === 'database') {
    saveParams.path = state.databasePath;
    saveParams.fields = state.dbFieldValues;
    if (state.includeCover && state.page.cover) saveParams.cover = state.page.cover;
  }

  const imageUrls = state.page.images.map((i) => i.url);

  try {
    let resp: ExecuteClipResponse;
    if (!isExtensionEnv) {
      await new Promise((r) => setTimeout(r, 250));
      resp = {
        ok: true,
        live: true,
        imagesDownloaded: imageUrls.length,
        imagesFailed: 0,
        result: {
          space: sp.name,
          spaceId: sp.id,
          path: state.saveMode === 'database' ? state.databasePath : `${state.dir || 'Reading'}/${saveParams.title}.md`,
          title: saveParams.title || '',
          mode: state.saveMode,
        },
      };
    } else {
      resp = await sendBg<ExecuteClipResponse>({
        type: 'clip.execute',
        payload: {
          tabId: state.activeTabId,
          pageUrl: state.page.url,
          saveParams,
          downloadImages: state.downloadImages && imageUrls.length > 0,
          imageUrls,
          coverUrl: state.includeCover ? state.page.cover : undefined,
        },
      });
    }

    byId('progress-wrap').classList.add('hidden');
    const banner = byId('result-banner');
    banner.classList.remove('hidden', 'ok', 'err');
    if (resp.ok && resp.result) {
      banner.classList.add('ok');
      const parts = [`${t('已保存')}：${resp.result.space} / ${resp.result.path}`];
      if (resp.imagesDownloaded > 0) {
        parts.push(`${resp.imagesDownloaded} ${t('张图片已本地化')}`);
      }
      if (resp.imagesFailed > 0) {
        parts.push(`${resp.imagesFailed} ${t('张图片回退外链')}`);
      }
      banner.textContent = parts.join(' · ');
    } else {
      banner.classList.add('err');
      banner.textContent = resp.error || '保存失败';
    }
  } catch (err) {
    byId('progress-wrap').classList.add('hidden');
    const banner = byId('result-banner');
    banner.classList.remove('hidden', 'ok', 'err');
    banner.classList.add('err');
    banner.textContent = err instanceof Error ? err.message : String(err);
  } finally {
    state.saving = false;
    byId<HTMLButtonElement>('btn-save').disabled = state.hostMissing || !state.page;
  }
}

async function loadNativeContext(): Promise<void> {
  if (!isExtensionEnv) {
    const demo = buildDemoFixtures();
    state.context = demo.context;
    state.hostMissing = false;
    state.hostError = '';
    renderConnectionBadge();
    renderSpacesDropdown();
    renderAIUI();
    return;
  }

  const resp = await sendBg<{
    ok: boolean;
    result?: ClipContextResult;
    error?: string;
    hostMissing?: boolean;
    originForbidden?: boolean;
  }>({
    type: 'native.call',
    action: 'clip.context',
  });

  if (!resp.ok || !resp.result) {
    state.context = null;
    state.hostMissing = true;
    state.hostError = resp.error || 'Host unavailable';
    renderConnectionBadge();
    return;
  }

  state.context = resp.result;
  state.hostMissing = false;
  state.hostError = '';
  if (!state.spaceId) {
    state.spaceId =
      (state.settings.defaultSpaceId &&
      resp.result.spaces.some((s) => s.id === state.settings.defaultSpaceId)
        ? state.settings.defaultSpaceId
        : resp.result.activeSpaceId) ||
      resp.result.spaces[0]?.id ||
      '';
  }
  renderConnectionBadge();
  renderSpacesDropdown();
  renderAIUI();
}

async function init(): Promise<void> {
  state.settings = isExtensionEnv ? await loadSettings() : defaultSettings();
  setLocale(state.settings.language);
  wireEventListeners();

  // Check if context menu requested selection mode
  let preferredClipMode: ClipMode | null = null;
  if (isExtensionEnv) {
    try {
      const sess = await chrome.storage.session?.get('arcmd_clip_intent');
      const intent = sess?.arcmd_clip_intent as { mode?: ClipMode; at?: number } | undefined;
      if (intent?.mode && intent.at && Date.now() - intent.at < 8000) {
        preferredClipMode = intent.mode;
        await chrome.storage.session?.remove('arcmd_clip_intent');
      }
    } catch {
      // ignore
    }
  }

  const [ctxPromise, pagePromise] = [
    loadNativeContext(),
    (async (): Promise<{ ok: boolean; page?: ExtractedPage; error?: string; tabId?: number }> => {
      if (!isExtensionEnv) {
        return { ok: true, page: buildDemoFixtures().page };
      }
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id;
      const res = await sendBg<{ ok: boolean; page?: ExtractedPage; error?: string }>({
        type: 'tab.extract',
        tabId,
      });
      return { ...res, tabId };
    })(),
  ];

  const pageRes = await pagePromise;
  await ctxPromise;

  if (!pageRes.ok || !pageRes.page) {
    const card = byId('page-error-card');
    card.textContent = pageRes.error || '当前页面不支持剪藏（如浏览器内置页）';
    card.classList.remove('hidden');
    byId<HTMLButtonElement>('btn-save').disabled = true;
    return;
  }

  state.page = pageRes.page;
  state.activeTabId = pageRes.tabId;
  state.articleMarkdown = htmlToArcMarkdown(pageRes.page.articleHtml, { baseUrl: pageRes.page.url });
  state.selectionMarkdown = pageRes.page.selectionHtml
    ? htmlToArcMarkdown(pageRes.page.selectionHtml, { baseUrl: pageRes.page.url })
    : pageRes.page.selectionText;

  byId('img-count').textContent = pageRes.page.images.length > 0 ? `(${pageRes.page.images.length})` : '';
  renderHighlighterButton();
  renderConnectionBadge();
  renderAIUI();

  const picked = pickMatchingTemplate(
    state.settings.templates,
    pageRes.page.url,
    pageRes.page.domain,
  );

  const hasSelection = Boolean(pageRes.page.selectionText?.trim());
  if (preferredClipMode === 'selection' && hasSelection) {
    state.clipMode = 'selection';
  } else if (hasSelection) {
    state.clipMode = 'selection';
  } else {
    state.clipMode = picked.template.clipMode;
  }

  applyTemplate(picked.template, picked.autoMatched);

  // Run duplicate URL check in background without blocking initial render
  if (!isExtensionEnv) {
    renderDuplicateBanner(buildDemoFixtures().dup);
  } else if (!state.hostMissing && pageRes.page.url) {
    void sendBg<{ ok: boolean; result?: ClipCheckURLResult }>({
      type: 'native.call',
      action: 'clip.check_url',
      params: { url: pageRes.page.url },
    }).then((res) => {
      if (res.ok && res.result) {
        renderDuplicateBanner(res.result);
      }
    });
  }
}

function wireEventListeners(): void {
  byId('btn-options').addEventListener('click', () => {
    if (isExtensionEnv) chrome.runtime.openOptionsPage();
  });
  byId('btn-open-diag').addEventListener('click', () => {
    if (isExtensionEnv) chrome.runtime.openOptionsPage();
  });
  byId('btn-retry-conn').addEventListener('click', () => {
    void loadNativeContext();
  });

  byId('btn-highlight').addEventListener('click', async () => {
    if (!isExtensionEnv) {
      if (state.page) {
        state.page.highlighterActive = !state.page.highlighterActive;
        renderHighlighterButton();
      }
      return;
    }
    const resp = await sendBg<{ ok: boolean; active?: boolean }>({
      type: 'tab.toggleHighlighter',
      tabId: state.activeTabId,
    });
    if (resp.ok && state.page) {
      state.page.highlighterActive = Boolean(resp.active);
      renderHighlighterButton();
      if (resp.active) window.close();
    }
  });

  document.querySelectorAll<HTMLButtonElement>('[data-clip-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.clipMode as ClipMode;
      if (btn.disabled) return;
      state.clipMode = mode;
      updateClipModeUI();
      recomputeRenderedOutputs(true);
    });
  });

  byId<HTMLSelectElement>('sel-template').addEventListener('change', (e) => {
    const id = (e.target as HTMLSelectElement).value;
    const tpl = state.settings.templates.find((x) => x.id === id);
    if (tpl) applyTemplate(tpl, false, true);
  });

  byId<HTMLSelectElement>('sel-space').addEventListener('change', (e) => {
    state.spaceId = (e.target as HTMLSelectElement).value;
    renderSpaceDependentControls();
    recomputeRenderedOutputs(false);
  });

  byId<HTMLSelectElement>('sel-save-mode').addEventListener('change', (e) => {
    state.saveMode = (e.target as HTMLSelectElement).value as SaveMode;
    updateSaveModeVisibility();
    recomputeRenderedOutputs(true);
  });

  byId<HTMLInputElement>('inp-dir').addEventListener('input', (e) => {
    state.dir = (e.target as HTMLInputElement).value;
  });
  byId<HTMLSelectElement>('sel-space-template').addEventListener('change', (e) => {
    state.spaceTemplate = (e.target as HTMLSelectElement).value;
  });
  byId<HTMLSelectElement>('sel-daily-pos').addEventListener('change', (e) => {
    state.dailyPosition = (e.target as HTMLSelectElement).value as InsertPosition;
  });
  byId<HTMLSelectElement>('sel-append-doc').addEventListener('change', (e) => {
    state.appendDoc = (e.target as HTMLSelectElement).value;
  });
  byId<HTMLSelectElement>('sel-append-pos').addEventListener('change', (e) => {
    state.appendPosition = (e.target as HTMLSelectElement).value as InsertPosition;
  });
  byId<HTMLSelectElement>('sel-database').addEventListener('change', (e) => {
    state.databasePath = (e.target as HTMLSelectElement).value;
    renderDatabasePropertiesUI();
    renderMetaPreview();
  });
  byId<HTMLInputElement>('inp-title').addEventListener('input', (e) => {
    state.title = (e.target as HTMLInputElement).value;
  });

  byId<HTMLInputElement>('chk-images').addEventListener('change', (e) => {
    state.downloadImages = (e.target as HTMLInputElement).checked;
  });
  byId<HTMLInputElement>('chk-cover').addEventListener('change', (e) => {
    state.includeCover = (e.target as HTMLInputElement).checked;
    renderMetaPreview();
  });
  byId<HTMLInputElement>('chk-open').addEventListener('change', (e) => {
    state.openAfterSave = (e.target as HTMLInputElement).checked;
  });
  byId<HTMLInputElement>('chk-pin').addEventListener('change', (e) => {
    state.pin = (e.target as HTMLInputElement).checked;
  });
  byId<HTMLInputElement>('chk-fav').addEventListener('change', (e) => {
    state.favorite = (e.target as HTMLInputElement).checked;
  });

  byId<HTMLTextAreaElement>('txt-body').addEventListener('input', (e) => {
    state.body = (e.target as HTMLTextAreaElement).value;
    state.bodyManuallyEdited = true;
    byId('btn-reset-body').classList.remove('hidden');
  });

  byId('btn-reset-body').addEventListener('click', () => {
    state.bodyManuallyEdited = false;
    recomputeRenderedOutputs(true);
  });

  document.querySelectorAll<HTMLButtonElement>('[data-preview-tab]').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      const target = tabBtn.dataset.previewTab;
      document.querySelectorAll<HTMLButtonElement>('[data-preview-tab]').forEach((b) => {
        b.classList.toggle('active', b === tabBtn);
      });
      byId('txt-body').classList.toggle('hidden', target !== 'body');
      byId('pre-meta').classList.toggle('hidden', target !== 'meta');
    });
  });

  byId('btn-ai').addEventListener('click', () => void runAI());
  byId('btn-save').addEventListener('click', () => void handleSave());

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleSave();
    }
  });

  if (isExtensionEnv) {
    chrome.runtime.onMessage.addListener((msg: ExecuteClipProgress) => {
      if (!msg || msg.type !== 'clip.progress') return;
      byId('progress-wrap').classList.remove('hidden');
      if (msg.stage === 'images') {
        const pct = msg.total > 0 ? Math.round((msg.done / msg.total) * 85) : 50;
        byId('progress-label').textContent = `${t('正在下载图片')} (${msg.done}/${msg.total})…`;
        byId('progress-pct').textContent = `${pct}%`;
        byId<HTMLDivElement>('progress-bar').style.width = `${Math.max(8, pct)}%`;
      } else {
        byId('progress-label').textContent = t('正在保存…');
        byId('progress-pct').textContent = '95%';
        byId<HTMLDivElement>('progress-bar').style.width = '95%';
      }
    });
  }
}

void init();
