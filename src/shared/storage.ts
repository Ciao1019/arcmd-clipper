import { PRESET_TEMPLATES } from './presets';
import type { ClipTemplate, ExtensionSettings, WebHighlight } from './types';
import { normalizeUrl } from './urlnorm';

const SETTINGS_KEY = 'arcmd_clipper_settings_v1';
const HIGHLIGHTS_PREFIX = 'arcmd_hl_v1:';

export function defaultSettings(): ExtensionSettings {
  return {
    language: 'auto',
    defaultSpaceId: '',
    defaultDownloadImages: true,
    defaultOpenAfterSave: false,
    defaultHighlightColor: 'yellow',
    templates: PRESET_TEMPLATES.map((t) => structuredClone(t)),
  };
}

export async function loadSettings(): Promise<ExtensionSettings> {
  const defaults = defaultSettings();
  try {
    const res = await chrome.storage.local.get(SETTINGS_KEY);
    const stored = res[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined;
    if (!stored) return defaults;
    return {
      ...defaults,
      ...stored,
      templates:
        Array.isArray(stored.templates) && stored.templates.length > 0
          ? stored.templates
          : defaults.templates,
    };
  } catch {
    return defaults;
  }
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

export function exportTemplatesJSON(templates: ClipTemplate[]): string {
  return JSON.stringify({ version: 1, templates }, null, 2);
}

export function importTemplatesJSON(raw: string): ClipTemplate[] {
  const parsed = JSON.parse(raw) as { templates?: unknown } | unknown[];
  const list = Array.isArray(parsed) ? parsed : parsed?.templates;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('Invalid template JSON: expected non-empty templates array');
  }
  return list.map((item, idx) => {
    const t = item as Partial<ClipTemplate>;
    return {
      id: typeof t.id === 'string' && t.id.trim() ? t.id.trim() : `custom-${Date.now()}-${idx}`,
      name: typeof t.name === 'string' && t.name.trim() ? t.name.trim() : `Template ${idx + 1}`,
      description: typeof t.description === 'string' ? t.description : '',
      triggers: Array.isArray(t.triggers) ? t.triggers : [],
      clipMode: t.clipMode || 'article',
      saveMode: t.saveMode || 'create',
      spaceId: t.spaceId || '',
      dir: t.dir || '',
      targetPath: t.targetPath || '',
      dailyPosition: t.dailyPosition || 'bottom',
      appendPosition: t.appendPosition || 'bottom',
      titleTemplate: typeof t.titleTemplate === 'string' ? t.titleTemplate : '{{title}}',
      bodyTemplate: typeof t.bodyTemplate === 'string' ? t.bodyTemplate : '# {{title}}\n\n{{content}}',
      frontmatter: Array.isArray(t.frontmatter) ? t.frontmatter : [],
      databaseFields: t.databaseFields && typeof t.databaseFields === 'object' ? t.databaseFields : {},
      downloadImages: t.downloadImages ?? true,
      includeCover: t.includeCover ?? true,
      includeHighlights: t.includeHighlights ?? true,
      autoAI: Boolean(t.autoAI),
      aiPrompt: typeof t.aiPrompt === 'string' ? t.aiPrompt : '',
      openAfterSave: Boolean(t.openAfterSave),
    };
  });
}

export async function loadHighlights(url: string): Promise<WebHighlight[]> {
  const norm = normalizeUrl(url);
  if (!norm) return [];
  const key = HIGHLIGHTS_PREFIX + norm;
  try {
    const res = await chrome.storage.local.get(key);
    const list = res[key];
    return Array.isArray(list) ? (list as WebHighlight[]) : [];
  } catch {
    return [];
  }
}

export async function saveHighlights(url: string, highlights: WebHighlight[]): Promise<void> {
  const norm = normalizeUrl(url);
  if (!norm) return;
  const key = HIGHLIGHTS_PREFIX + norm;
  if (highlights.length === 0) {
    await chrome.storage.local.remove(key);
  } else {
    await chrome.storage.local.set({ [key]: highlights });
  }
}
