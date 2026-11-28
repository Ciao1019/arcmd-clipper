import type { WebHighlight } from '../shared/types';
import { extractFromDocument, extractSelectionFromWindow } from './extractor';
import { WebHighlighter } from './highlighter';

declare global {
  interface Window {
    __ARCMD_CLIPPER_LOADED__?: boolean;
  }
}

if (!window.__ARCMD_CLIPPER_LOADED__) {
  window.__ARCMD_CLIPPER_LOADED__ = true;

  const highlighter = new WebHighlighter((highlights: WebHighlight[]) => {
    void chrome.runtime.sendMessage({
      type: 'tab.saveHighlights',
      url: window.location.href,
      highlights,
    });
  });

  // Restore saved highlights for this URL on page load.
  void chrome.runtime
    .sendMessage({
      type: 'tab.getHighlights',
      url: window.location.href,
    })
    .then((resp: { highlights?: WebHighlight[] } | undefined) => {
      if (resp && Array.isArray(resp.highlights) && resp.highlights.length > 0) {
        highlighter.setHighlights(resp.highlights);
      }
    })
    .catch(() => {
      // Background may be waking up or storage unavailable on restricted pages.
    });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg !== 'object') return undefined;
    switch (msg.type) {
      case 'content.extract': {
        const sel = extractSelectionFromWindow(window);
        const page = extractFromDocument(document, window.location.href, {
          selectionHtml: sel.html,
          selectionText: sel.text,
          highlights: highlighter.getHighlights(),
          highlighterActive: highlighter.isActive(),
        });
        sendResponse({ ok: true, page });
        return false;
      }
      case 'content.toggleHighlighter': {
        const active = highlighter.toggle();
        sendResponse({ ok: true, active, count: highlighter.getHighlights().length });
        return false;
      }
      case 'content.clearHighlights': {
        highlighter.clearAll();
        sendResponse({ ok: true });
        return false;
      }
      default:
        return undefined;
    }
  });
}
