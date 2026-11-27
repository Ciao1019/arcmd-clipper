import { NATIVE_HOST_NAME } from '../manifest';
import type { NativeRequest, NativeResponse } from '../shared/types';

export interface NativeCallResult<T = unknown> extends NativeResponse<T> {
  hostMissing?: boolean;
  originForbidden?: boolean;
}

let reqSeq = 1;

function nextRequestId(): string {
  return `clip-${Date.now().toString(36)}-${reqSeq++}`;
}

export async function callNative<T = unknown>(
  action: string,
  params?: Record<string, unknown>,
  timeoutMs?: number,
): Promise<NativeCallResult<T>> {
  const effectiveTimeout = timeoutMs ?? (action === 'clip.ai' ? 65_000 : 15_000);
  const request: NativeRequest = {
    id: nextRequestId(),
    action,
    params,
  };

  return new Promise<NativeCallResult<T>>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({
        ok: false,
        error: `ArcMD Native Host timed out after ${Math.round(effectiveTimeout / 1000)}s`,
      });
    }, effectiveTimeout);

    try {
      chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, request, (response?: NativeResponse<T>) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        const lastErr = chrome.runtime.lastError;
        if (lastErr) {
          const msg = lastErr.message || 'Native messaging error';
          const lower = msg.toLowerCase();
          resolve({
            ok: false,
            error: msg,
            hostMissing:
              lower.includes('not found') ||
              lower.includes('specified native messaging host') ||
              lower.includes('exited'),
            originForbidden: lower.includes('forbidden') || lower.includes('access to the specified'),
          });
          return;
        }

        if (!response || typeof response !== 'object') {
          resolve({
            ok: false,
            error: 'Empty response from ArcMD Native Host',
            hostMissing: true,
          });
          return;
        }
        resolve(response);
      });
    } catch (err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        hostMissing: true,
      });
    }
  });
}
