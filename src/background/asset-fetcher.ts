import type { ClipUploadAssetResult, ExecuteClipProgress } from '../shared/types';
import { callNative } from './native';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // Matches ArcMD clipper.MaxAssetBytes
const MAX_IMAGES_PER_CLIP = 60;
const CONCURRENCY = 4;

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

async function fetchImageInServiceWorker(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const resp = await fetch(url, {
      credentials: 'include',
      redirect: 'follow',
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
  }
}

async function fetchImageInTab(tabId: number, url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      args: [url, MAX_IMAGE_BYTES],
      func: async (imgUrl: string, maxBytes: number) => {
        try {
          const resp = await fetch(imgUrl, { credentials: 'include', mode: 'cors' });
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
        }
      },
    });
    const val = results?.[0]?.result as { base64: string; mimeType: string } | null | undefined;
    return val && val.base64 ? val : null;
  } catch {
    return null;
  }
}

function broadcastProgress(stage: ExecuteClipProgress['stage'], done: number, total: number): void {
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
}): Promise<LocalizeAssetsResult> {
  const unique = Array.from(new Set(opts.imageUrls.filter((u) => /^https?:\/\//i.test(u)))).slice(
    0,
    MAX_IMAGES_PER_CLIP,
  );
  if (unique.length === 0) {
    return { imageMap: {}, downloaded: 0, failed: 0 };
  }

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
      let fetched = await fetchImageInServiceWorker(url);
      if (!fetched && opts.tabId !== undefined) {
        fetched = await fetchImageInTab(opts.tabId, url);
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
