import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchImageInServiceWorker, localizeClipAssets } from '../src/background/asset-fetcher';

describe('asset-fetcher timeout & validation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('aborts and returns null when image fetch hangs past timeoutMs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      }),
    );

    const start = Date.now();
    const res = await fetchImageInServiceWorker('https://example.com/slow.png', 40);
    const elapsed = Date.now() - start;

    expect(res).toBeNull();
    expect(elapsed).toBeLessThan(1000);
  });

  it('decodes valid image response to base64 and rejects HTML error bodies', async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('.png')) {
          return new Response(pngBytes, {
            status: 200,
            headers: { 'content-type': 'image/png' },
          });
        }
        return new Response('<html>403</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }),
    );

    const ok = await fetchImageInServiceWorker('https://example.com/ok.png', 1000);
    expect(ok).not.toBeNull();
    expect(ok?.mimeType).toBe('image/png');
    expect(ok?.base64).toBe('iVBORw0KGgo=');

    const html = await fetchImageInServiceWorker('https://example.com/blocked', 1000);
    expect(html).toBeNull();
  });

  it('shares a single timeout budget across service worker and tab fallback', async () => {
    const executeScript = vi.fn(async () => [{ result: { base64: 'iVBORw0KGgo=', mimeType: 'image/png' } }]);
    const sendNativeMessage = vi.fn((_host: string, _req: unknown, cb: (resp: unknown) => void) => {
      cb({ ok: true, result: { space: 'Personal', relUrl: 'assets/anti.png', storedPath: 'Clips/assets/anti.png', bytes: 8 } });
    });
    vi.stubGlobal('chrome', {
      runtime: { sendMessage: vi.fn(() => Promise.resolve()), sendNativeMessage },
      scripting: { executeScript },
    });

    // 1. Hanging service worker exhausts the shared budget -> must NOT spend another timeout in the tab.
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        });
      }),
    );
    const hung = await localizeClipAssets({
      space: 'sp1',
      docDir: 'Clips',
      imageUrls: ['https://example.com/hang.png'],
      tabId: 1,
      timeoutMs: 60,
    });
    expect(hung).toEqual({ imageMap: {}, downloaded: 0, failed: 1 });
    expect(executeScript).not.toHaveBeenCalled();

    // 2. Fast 403 rejection leaves ample budget -> falls back to tab context and uploads cleanly.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Forbidden', { status: 403 })),
    );
    const anti = await localizeClipAssets({
      space: 'sp1',
      docDir: 'Clips',
      imageUrls: ['https://example.com/anti.png'],
      tabId: 1,
      timeoutMs: 1000,
    });
    expect(executeScript).toHaveBeenCalledTimes(1);
    expect(anti.downloaded).toBe(1);
    expect(anti.failed).toBe(0);
    expect(anti.imageMap['https://example.com/anti.png']).toBe('assets/anti.png');
  });
});
