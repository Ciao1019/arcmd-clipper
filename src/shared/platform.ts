export function isMacPlatform(platform?: string, userAgent?: string): boolean {
  const plat = platform ?? (typeof navigator !== 'undefined' ? navigator.platform || '' : '');
  const ua = userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent || '' : '');
  return /mac/i.test(plat) || /mac os x|macintosh/i.test(ua);
}

export function formatSaveShortcut(isMac = isMacPlatform()): string {
  return isMac ? '⌘↵' : 'Ctrl+↵';
}

export function formatHighlightShortcut(isMac = isMacPlatform()): string {
  return isMac ? '⌥⇧H' : 'Alt+Shift+H';
}
