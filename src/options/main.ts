import { NATIVE_HOST_NAME } from '../manifest';
import { PRESET_TEMPLATES } from '../shared/presets';
import {
  defaultSettings,
  exportTemplatesJSON,
  importTemplatesJSON,
  loadSettings,
  saveSettings,
} from '../shared/storage';
import type {
  ClipPingResult,
  ClipTemplate,
  ExtensionSettings,
  FrontmatterField,
  HighlightColor,
  TemplateTrigger,
} from '../shared/types';

const isExtensionEnv = typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);

const TEMPLATE_VARIABLES = [
  '{{title}}',
  '{{url}}',
  '{{author}}',
  '{{published}}',
  '{{date}}',
  '{{time}}',
  '{{site}}',
  '{{description}}',
  '{{highlights}}',
  '{{ai_summary}}',
  '{{ai_tags}}',
  '{{content}}',
];

let settings: ExtensionSettings = defaultSettings();
let selectedId = settings.templates[0].id;
let toastTimer: number | undefined;

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
}

function showToast(msg: string, isErr = false): void {
  const el = byId('toast');
  el.textContent = msg;
  el.classList.remove('hidden', 'err');
  if (isErr) el.classList.add('err');
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.add('hidden'), 3200);
}

async function persist(): Promise<void> {
  if (isExtensionEnv) {
    await saveSettings(settings);
  }
}

function selectedTemplate(): ClipTemplate {
  return settings.templates.find((t) => t.id === selectedId) || settings.templates[0];
}

function renderTemplateList(): void {
  const wrap = byId('tpl-list');
  wrap.innerHTML = '';
  for (const tpl of settings.templates) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `tpl-item ${tpl.id === selectedId ? 'active' : ''}`;
    const triggerSummary =
      tpl.triggers.length > 0
        ? tpl.triggers.map((tr) => tr.pattern).join(', ')
        : '手动选择 / 默认回退';
    btn.innerHTML = `<div class="tpl-item-name"></div><div class="tpl-item-meta"></div>`;
    (btn.querySelector('.tpl-item-name') as HTMLElement).textContent = tpl.name;
    (btn.querySelector('.tpl-item-meta') as HTMLElement).textContent = `${tpl.saveMode} · ${triggerSummary}`;
    btn.addEventListener('click', () => {
      selectedId = tpl.id;
      renderTemplateList();
      renderTemplateEditor();
    });
    wrap.appendChild(btn);
  }
}

function renderTriggersEditor(triggers: TemplateTrigger[]): void {
  const wrap = byId('ed-triggers');
  wrap.innerHTML = '';
  triggers.forEach((tr, idx) => {
    const row = document.createElement('div');
    row.className = 'repeat-row';

    const sel = document.createElement('select');
    sel.innerHTML = `
      <option value="domain">域名 (domain)</option>
      <option value="prefix">URL 前缀</option>
      <option value="regex">正则 (regex)</option>
    `;
    sel.value = tr.type;
    sel.addEventListener('change', () => {
      tr.type = sel.value as TemplateTrigger['type'];
    });

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = tr.pattern;
    inp.placeholder = tr.type === 'domain' ? '如 github.com' : '匹配规则';
    inp.addEventListener('input', () => {
      tr.pattern = inp.value;
    });

    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'btn-secondary small';
    rm.textContent = '删除';
    rm.addEventListener('click', () => {
      triggers.splice(idx, 1);
      renderTriggersEditor(triggers);
    });

    row.append(sel, inp, rm);
    wrap.appendChild(row);
  });
}

function renderFrontmatterEditor(fields: FrontmatterField[]): void {
  const wrap = byId('ed-frontmatter');
  wrap.innerHTML = '';
  fields.forEach((f, idx) => {
    const row = document.createElement('div');
    row.className = 'repeat-row fm-row';

    const keyInp = document.createElement('input');
    keyInp.type = 'text';
    keyInp.value = f.key;
    keyInp.placeholder = '键名，如 source';
    keyInp.addEventListener('input', () => {
      f.key = keyInp.value;
    });

    const typeSel = document.createElement('select');
    typeSel.innerHTML = `
      <option value="text">文本</option>
      <option value="list">列表</option>
      <option value="number">数字</option>
      <option value="checkbox">复选框</option>
    `;
    typeSel.value = f.type || 'text';
    typeSel.addEventListener('change', () => {
      f.type = typeSel.value as FrontmatterField['type'];
    });

    const valInp = document.createElement('input');
    valInp.type = 'text';
    valInp.value = f.value;
    valInp.placeholder = '值模板，如 {{url}}';
    valInp.addEventListener('input', () => {
      f.value = valInp.value;
    });

    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'btn-secondary small';
    rm.textContent = '删除';
    rm.addEventListener('click', () => {
      fields.splice(idx, 1);
      renderFrontmatterEditor(fields);
    });

    row.append(keyInp, typeSel, valInp, rm);
    wrap.appendChild(row);
  });
}

function renderTemplateEditor(): void {
  const tpl = selectedTemplate();
  byId<HTMLInputElement>('ed-name').value = tpl.name;
  byId<HTMLInputElement>('ed-desc').value = tpl.description || '';
  byId<HTMLSelectElement>('ed-clip-mode').value = tpl.clipMode;
  byId<HTMLSelectElement>('ed-save-mode').value = tpl.saveMode;
  byId<HTMLInputElement>('ed-dir').value =
    tpl.saveMode === 'database' || tpl.saveMode === 'append' ? tpl.targetPath || '' : tpl.dir || '';
  byId<HTMLInputElement>('ed-title').value = tpl.titleTemplate;
  byId<HTMLTextAreaElement>('ed-body').value = tpl.bodyTemplate;
  byId<HTMLInputElement>('ed-ai-prompt').value = tpl.aiPrompt || '';
  byId<HTMLInputElement>('ed-dl-img').checked = tpl.downloadImages;
  byId<HTMLInputElement>('ed-cover').checked = tpl.includeCover;
  byId<HTMLInputElement>('ed-hl').checked = tpl.includeHighlights;
  byId<HTMLInputElement>('ed-open').checked = Boolean(tpl.openAfterSave);

  renderTriggersEditor(tpl.triggers);
  renderFrontmatterEditor(tpl.frontmatter);
  byId<HTMLButtonElement>('btn-del-tpl').disabled = settings.templates.length <= 1;
}

function renderPrefs(): void {
  byId<HTMLSelectElement>('pref-lang').value = settings.language;
  byId<HTMLSelectElement>('pref-hl-color').value = settings.defaultHighlightColor;
  byId<HTMLInputElement>('pref-dl-img').checked = settings.defaultDownloadImages;
  byId<HTMLInputElement>('pref-open-after').checked = settings.defaultOpenAfterSave;
}

function renderDiagnosticsMeta(): void {
  const extId = isExtensionEnv ? chrome.runtime.id : 'njbinggncmencnnnhcccpamjiolhglen';
  byId('diag-host-name').textContent = NATIVE_HOST_NAME;
  byId('diag-ext-id').textContent = extId;
  byId('diag-cli-id').textContent = extId;
}

async function runHostPing(): Promise<void> {
  const statusEl = byId('diag-status');
  const jsonEl = byId<HTMLPreElement>('diag-json');
  statusEl.textContent = '正在连接…';
  statusEl.className = 'status-pill';

  if (!isExtensionEnv) {
    statusEl.textContent = '已连接（演示模式 · v0.5.0）';
    statusEl.classList.add('ok');
    jsonEl.textContent = JSON.stringify(
      { ok: true, live: true, version: '0.5.0', protocol: 1, aiReady: true, aiModel: 'gpt-4.1-mini' },
      null,
      2,
    );
    jsonEl.classList.remove('hidden');
    return;
  }

  const resp = (await chrome.runtime.sendMessage({
    type: 'native.call',
    action: 'clip.ping',
  })) as { ok: boolean; result?: ClipPingResult; error?: string };

  jsonEl.textContent = JSON.stringify(resp, null, 2);
  jsonEl.classList.remove('hidden');

  if (resp.ok && resp.result) {
    const mode = resp.result.live ? '实时同步模式' : '离线直写模式';
    statusEl.textContent = `连接成功 · ArcMD v${resp.result.version} (${mode})`;
    statusEl.classList.add('ok');
  } else {
    statusEl.textContent = `连接失败：${resp.error || '未找到宿主'}`;
    statusEl.classList.add('err');
  }
}

function wireEvents(): void {
  // Navigation tabs
  document.querySelectorAll<HTMLButtonElement>('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.section;
      document.querySelectorAll<HTMLButtonElement>('.nav-item').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
      ['templates', 'prefs', 'diagnostics'].forEach((sec) => {
        byId(`sec-${sec}`).classList.toggle('hidden', sec !== target);
      });
    });
  });

  // Variable chips insert into textarea at caret
  const chipsWrap = byId('var-chips');
  for (const token of TEMPLATE_VARIABLES) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'var-chip';
    chip.textContent = token;
    chip.addEventListener('click', () => {
      const ta = byId<HTMLTextAreaElement>('ed-body');
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? ta.value.length;
      ta.value = ta.value.slice(0, start) + token + ta.value.slice(end);
      ta.focus();
      ta.setSelectionRange(start + token.length, start + token.length);
    });
    chipsWrap.appendChild(chip);
  }

  byId('btn-add-trigger').addEventListener('click', () => {
    const tpl = selectedTemplate();
    tpl.triggers.push({ type: 'domain', pattern: '' });
    renderTriggersEditor(tpl.triggers);
  });

  byId('btn-add-fm').addEventListener('click', () => {
    const tpl = selectedTemplate();
    tpl.frontmatter.push({ key: '', value: '', type: 'text' });
    renderFrontmatterEditor(tpl.frontmatter);
  });

  byId('btn-save-tpl').addEventListener('click', async () => {
    const tpl = selectedTemplate();
    tpl.name = byId<HTMLInputElement>('ed-name').value.trim() || 'Untitled Template';
    tpl.description = byId<HTMLInputElement>('ed-desc').value.trim();
    tpl.clipMode = byId<HTMLSelectElement>('ed-clip-mode').value as ClipTemplate['clipMode'];
    tpl.saveMode = byId<HTMLSelectElement>('ed-save-mode').value as ClipTemplate['saveMode'];
    const pathVal = byId<HTMLInputElement>('ed-dir').value.trim();
    if (tpl.saveMode === 'database' || tpl.saveMode === 'append') {
      tpl.targetPath = pathVal;
    } else {
      tpl.dir = pathVal;
    }
    tpl.titleTemplate = byId<HTMLInputElement>('ed-title').value;
    tpl.bodyTemplate = byId<HTMLTextAreaElement>('ed-body').value;
    tpl.aiPrompt = byId<HTMLInputElement>('ed-ai-prompt').value.trim();
    tpl.downloadImages = byId<HTMLInputElement>('ed-dl-img').checked;
    tpl.includeCover = byId<HTMLInputElement>('ed-cover').checked;
    tpl.includeHighlights = byId<HTMLInputElement>('ed-hl').checked;
    tpl.openAfterSave = byId<HTMLInputElement>('ed-open').checked;
    tpl.triggers = tpl.triggers.filter((t) => t.pattern.trim() !== '');
    tpl.frontmatter = tpl.frontmatter.filter((f) => f.key.trim() !== '');

    await persist();
    renderTemplateList();
    renderTemplateEditor();
    showToast('模板已保存');
  });

  byId('btn-new-tpl').addEventListener('click', async () => {
    const created: ClipTemplate = {
      id: `custom-${Date.now().toString(36)}`,
      name: '新建剪藏模板',
      description: '',
      triggers: [],
      clipMode: 'article',
      saveMode: 'create',
      dir: '',
      titleTemplate: '{{title}}',
      frontmatter: [
        { key: 'source', value: '{{url}}', type: 'text' },
        { key: 'clipped', value: '{{date}}', type: 'text' },
      ],
      bodyTemplate: '# {{title}}\n\n{{content}}',
      downloadImages: settings.defaultDownloadImages,
      includeCover: true,
      includeHighlights: true,
      openAfterSave: settings.defaultOpenAfterSave,
    };
    settings.templates.push(created);
    selectedId = created.id;
    await persist();
    renderTemplateList();
    renderTemplateEditor();
    showToast('已创建新模板');
  });

  byId('btn-del-tpl').addEventListener('click', async () => {
    if (settings.templates.length <= 1) return;
    settings.templates = settings.templates.filter((t) => t.id !== selectedId);
    selectedId = settings.templates[0].id;
    await persist();
    renderTemplateList();
    renderTemplateEditor();
    showToast('已删除模板');
  });

  byId('btn-reset-tpl').addEventListener('click', async () => {
    settings.templates = PRESET_TEMPLATES.map((t) => structuredClone(t));
    selectedId = settings.templates[0].id;
    await persist();
    renderTemplateList();
    renderTemplateEditor();
    showToast('已恢复内置预设模板');
  });

  byId('btn-export-tpl').addEventListener('click', () => {
    const blob = new Blob([exportTemplatesJSON(settings.templates)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'arcmd-clipper-templates.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('已导出模板 JSON');
  });

  byId('btn-import-tpl').addEventListener('click', () => {
    byId<HTMLInputElement>('file-import').click();
  });

  byId<HTMLInputElement>('file-import').addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = importTemplatesJSON(text);
      settings.templates = imported;
      selectedId = imported[0].id;
      await persist();
      renderTemplateList();
      renderTemplateEditor();
      showToast(`已导入 ${imported.length} 个模板`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '导入失败', true);
    } finally {
      (e.target as HTMLInputElement).value = '';
    }
  });

  byId('btn-save-prefs').addEventListener('click', async () => {
    settings.language = byId<HTMLSelectElement>('pref-lang').value as ExtensionSettings['language'];
    settings.defaultHighlightColor = byId<HTMLSelectElement>('pref-hl-color').value as HighlightColor;
    settings.defaultDownloadImages = byId<HTMLInputElement>('pref-dl-img').checked;
    settings.defaultOpenAfterSave = byId<HTMLInputElement>('pref-open-after').checked;
    await persist();
    showToast('偏好设置已保存');
  });

  byId('btn-test-host').addEventListener('click', () => void runHostPing());
  byId('btn-copy-id').addEventListener('click', async () => {
    const id = byId('diag-ext-id').textContent || '';
    await navigator.clipboard.writeText(id);
    showToast('已复制扩展 ID');
  });
}

async function init(): Promise<void> {
  settings = isExtensionEnv ? await loadSettings() : defaultSettings();
  selectedId = settings.templates[0]?.id || 'default-article';
  wireEvents();
  renderTemplateList();
  renderTemplateEditor();
  renderPrefs();
  renderDiagnosticsMeta();
}

void init();
