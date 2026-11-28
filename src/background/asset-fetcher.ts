import type { ClipUploadAssetResult, ExecuteClipProgress } from '../shared/types';
import { callNative } from './native';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // Matches ArcMD clipper.MaxAssetBytes
const MAX_IMAGES_PER_CLIP = 60;
const CONCURRENCY = 4;
export const DEFAULT_IMAGE_FETCH_TIMEOUT_MS = 10_000;

export interface LocalizeAssetsResult {
  imageMap: Record<string, string>;
  downloaded: number;
  failed: number;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    chunks.push(String.fromCharCode(...slice));
  }
  return btoa(chunks.join(''));
}

function guessFilename(url: string, idx: number): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean).pop() || '';
    const cleaned = seg.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 48);
    if (cleaned && cleaned.length >= 3) return cleaned;
  } catch {
    // ignore
  }
  return `clip-image-${idx + 1}.png`;
}

export async function fetchImageInServiceWorker(
  url: string,
  timeoutMs = DEFAULT_IMAGE_FETCH_TIMEOUT_MS,
): Promise<{ base64: string; mimeType: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      credentials: 'include',
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const mimeType = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (mimeType && !mimeType.startsWith('image/') && mimeType !== 'application/octet-stream') {
      return null;
    }
    const buf = await resp.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_IMAGE_BYTES) return null;
    return {
      base64: arrayBufferToBase64(buf),
      mimeType: mimeType || 'image/png',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchImageInTab(
  tabId: number,
  url: string,
  timeoutMs = DEFAULT_IMAGE_FETCH_TIMEOUT_MS,
): Promise<{ base64: string; mimeType: string } | null> {
  let outerTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const execPromise = chrome.scripting.executeScript({
      target: { tabId },
      args: [url, MAX_IMAGE_BYTES, timeoutMs],
      func: async (imgUrl: string, maxBytes: number, innerTimeoutMs: number) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), innerTimeoutMs);
        try {
          const resp = await fetch(imgUrl, {
            credentials: 'include',
            mode: 'cors',
            signal: controller.signal,
          });
          if (!resp.ok) return null;
          const blob = await resp.blob();
          if (blob.size === 0 || blob.size > maxBytes) return null;
          const mimeType = blob.type || 'image/png';
          const dataUrl: string = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
          const comma = dataUrl.indexOf(',');
          if (comma < 0) return null;
          return { base64: dataUrl.slice(comma + 1), mimeType };
        } catch {
          return null;
        } finally {
          clearTimeout(timer);
        }
      },
    });
    const results = await Promise.race([
      execPromise,
      new Promise<null>((resolve) => {
        outerTimer = setTimeout(() => resolve(null), timeoutMs + 2_000);
      }),
    ]);
    const val = results?.[0]?.result as { base64: string; mimeType: string } | null | undefined;
    return val && val.base64 ? val : null;
  } catch {
    return null;
  } finally {
    if (outerTimer !== undefined) clearTimeout(outerTimer);
  }
}

function broadcastProgress(stage: ExecuteClipProgress['stage'], done: number, total: number): void {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
  const msg: ExecuteClipProgress = { type: 'clip.progress', stage, done, total };
  chrome.runtime.sendMessage(msg).catch(() => {
    // Popup might have closed; ignore.
  });
}

export async function localizeClipAssets(opts: {
  space: string;
  docDir: string;
  imageUrls: string[];
  tabId?: number;
  timeoutMs?: number;
}): Promise<LocalizeAssetsResult> {
  const unique = Array.from(new Set(opts.imageUrls.filter((u) => /^https?:\/\//i.test(u)))).slice(
    0,
    MAX_IMAGES_PER_CLIP,
  );
  if (unique.length === 0) {
    return { imageMap: {}, downloaded: 0, failed: 0 };
  }

  const perImageTimeoutMs = opts.timeoutMs ?? DEFAULT_IMAGE_FETCH_TIMEOUT_MS;
  const minFallbackBudgetMs = Math.min(500, Math.floor(perImageTimeoutMs / 4));
  const imageMap: Record<string, string> = {};
  let downloaded = 0;
  let failed = 0;
  let completed = 0;
  let cursor = 0;

  broadcastProgress('images', 0, unique.length);

  const worker = async () => {
    while (cursor < unique.length) {
      const idx = cursor++;
      const url = unique[idx];
      const deadline = Date.now() + perImageTimeoutMs;
      let fetched = await fetchImageInServiceWorker(url, perImageTimeoutMs);
      if (!fetched && opts.tabId !== undefined) {
        const remainingMs = deadline - Date.now();
        if (remainingMs >= minFallbackBudgetMs) {
          fetched = await fetchImageInTab(opts.tabId, url, remainingMs);
        }
      }
      if (!fetched) {
        failed++;
      } else {
        const uploaded = await callNative<ClipUploadAssetResult>('clip.upload_asset', {
          space: opts.space,
          docDir: opts.docDir,
          filename: guessFilename(url, idx),
          mimeType: fetched.mimeType,
          dataBase64: fetched.base64,
        });
        if (uploaded.ok && uploaded.result?.relUrl) {
          imageMap[url] = uploaded.result.relUrl;
          downloaded++;
        } else {
          failed++;
        }
      }
      completed++;
      broadcastProgress('images', completed, unique.length);
    }
  };

  const workers = Array.from({ length: Math.min(CONCURRENCY, unique.length) }, () => worker());
  await Promise.all(workers);

  return { imageMap, downloaded, failed };
}
