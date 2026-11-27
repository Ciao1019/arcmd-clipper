import { loadHighlights, saveHighlights } from '../shared/storage';
import type {
  BgRequest,
  ClipSaveResult,
  ExecuteClipPayload,
  ExecuteClipProgress,
  ExecuteClipResponse,
} from '../shared/types';
import { localizeClipAssets } from './asset-fetcher';
import { callNative } from './native';

const MENU_CLIP_PAGE = 'arcmd-clip-page';
const MENU_CLIP_SELECTION = 'arcmd-clip-selection';
const MENU_TOGGLE_HIGHLIGHTER = 'arcmd-toggle-highlighter';

function setupContextMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_CLIP_PAGE,
      title: '剪藏页面到 ArcMD',
      contexts: ['page'],
    });
    chrome.contextMenus.create({
      id: MENU_CLIP_SELECTION,
      title: '剪藏选中内容到 ArcMD',
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: MENU_TOGGLE_HIGHLIGHTER,
      title: '切换 ArcMD 网页高亮标注模式',
      contexts: ['page', 'selection'],
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenus();
});

async function getActiveTabId(explicitTabId?: number): Promise<number | undefined> {
  if (typeof explicitTabId === 'number') return explicitTabId;
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id;
}

async function sendToTabWithInjection<T>(tabId: number, message: Record<string, unknown>): Promise<T> {
  try {
    return (await chrome.tabs.sendMessage(tabId, message)) as T;
  } catch {
    // Tab was likely open before the extension loaded; inject content.js on demand.
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });
    return (await chrome.tabs.sendMessage(tabId, message)) as T;
  }
}

async function openClipPopup(preferredMode?: 'article' | 'selection'): Promise<void> {
  try {
    if (preferredMode && chrome.storage.session) {
      await chrome.storage.session.set({
        arcmd_clip_intent: { mode: preferredMode, at: Date.now() },
      });
    }
  } catch {
    // ignore session storage unavailability
  }
  try {
    await chrome.action.openPopup();
  } catch {
    // Some Chrome versions restrict openPopup outside direct user gestures.
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_CLIP_PAGE) {
    void openClipPopup('article');
  } else if (info.menuItemId === MENU_CLIP_SELECTION) {
    void openClipPopup('selection');
  } else if (info.menuItemId === MENU_TOGGLE_HIGHLIGHTER && tab?.id !== undefined) {
    void sendToTabWithInjection(tab.id, { type: 'content.toggleHighlighter' }).catch(() => {});
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-highlighter') {
    void getActiveTabId().then((tabId) => {
      if (tabId !== undefined) {
        return sendToTabWithInjection(tabId, { type: 'content.toggleHighlighter' }).catch(() => {});
      }
      return undefined;
    });
  }
});

function computeDocDir(saveParams: ExecuteClipPayload['saveParams']): string {
  if (saveParams.mode === 'create') {
    return (saveParams.dir || '').replace(/^\/+|\/+$/g, '');
  }
  if ((saveParams.mode === 'append' || saveParams.mode === 'database') && saveParams.path) {
    const idx = saveParams.path.lastIndexOf('/');
    return idx > 0 ? saveParams.path.slice(0, idx) : '';
  }
  return '';
}

function rewriteUrlsInMarkdown(content: string, imageMap: Record<string, string>): string {
  let out = content;
  for (const [remote, local] of Object.entries(imageMap)) {
    if (!remote || !local || remote === local) continue;
    out = out.split(remote).join(local);
  }
  return out;
}

async function executeClip(payload: ExecuteClipPayload): Promise<ExecuteClipResponse> {
  const saveParams = { ...payload.saveParams };
  let imagesDownloaded = 0;
  let imagesFailed = 0;

  if (payload.downloadImages) {
    const allUrls = [...payload.imageUrls];
    if (payload.coverUrl) allUrls.unshift(payload.coverUrl);
    const localized = await localizeClipAssets({
      space: saveParams.space,
      docDir: computeDocDir(saveParams),
      imageUrls: allUrls,
      tabId: payload.tabId,
    });
    imagesDownloaded = localized.downloaded;
    imagesFailed = localized.failed;

    if (Object.keys(localized.imageMap).length > 0) {
      saveParams.content = rewriteUrlsInMarkdown(saveParams.content, localized.imageMap);
      if (saveParams.cover && localized.imageMap[saveParams.cover]) {
        saveParams.cover = localized.imageMap[saveParams.cover];
      }
    }
  }

  const savingProgress: ExecuteClipProgress = {
    type: 'clip.progress',
    stage: 'saving',
    done: 1,
    total: 1,
  };
  chrome.runtime.sendMessage(savingProgress).catch(() => {});

  const resp = await callNative<ClipSaveResult>('clip.save', saveParams as unknown as Record<string, unknown>);
  if (!resp.ok) {
    return {
      ok: false,
      error: resp.error || 'Failed to save clip to ArcMD',
      imagesDownloaded,
      imagesFailed,
    };
  }
  return {
    ok: true,
    result: resp.result,
    live: resp.live,
    imagesDownloaded,
    imagesFailed,
  };
}

chrome.runtime.onMessage.addListener((rawMsg: BgRequest, _sender, sendResponse) => {
  if (!rawMsg || typeof rawMsg !== 'object' || !('type' in rawMsg)) return undefined;

  const handle = async (): Promise<unknown> => {
    switch (rawMsg.type) {
      case 'native.call':
        return callNative(rawMsg.action, rawMsg.params);
      case 'clip.execute':
        return executeClip(rawMsg.payload);
      case 'tab.extract': {
        const tabId = await getActiveTabId(rawMsg.tabId);
        if (tabId === undefined) return { ok: false, error: 'No active tab' };
        try {
          return await sendToTabWithInjection(tabId, { type: 'content.extract' });
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : 'Cannot access this page (e.g. chrome://)',
          };
        }
      }
      case 'tab.toggleHighlighter': {
        const tabId = await getActiveTabId(rawMsg.tabId);
        if (tabId === undefined) return { ok: false, error: 'No active tab' };
        try {
          return await sendToTabWithInjection(tabId, { type: 'content.toggleHighlighter' });
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      }
      case 'tab.getHighlights': {
        const highlights = await loadHighlights(rawMsg.url);
        return { ok: true, highlights };
      }
      case 'tab.saveHighlights': {
        await saveHighlights(rawMsg.url, rawMsg.highlights);
        return { ok: true };
      }
      case 'tab.clearHighlights': {
        await saveHighlights(rawMsg.url, []);
        const tabId = await getActiveTabId(rawMsg.tabId);
        if (tabId !== undefined) {
          await sendToTabWithInjection(tabId, { type: 'content.clearHighlights' }).catch(() => {});
        }
        return { ok: true };
      }
      default:
        return { ok: false, error: 'Unknown background message' };
    }
  };

  void handle().then(sendResponse);
  return true;
});
