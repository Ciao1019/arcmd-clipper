import { describe, expect, it } from 'vitest';
import { formatHighlightShortcut, formatSaveShortcut, isMacPlatform } from '../src/shared/platform';

describe('platform shortcuts', () => {
  it('detects macOS from navigator platform or user agent', () => {
    expect(isMacPlatform('MacIntel', '')).toBe(true);
    expect(isMacPlatform('', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(true);
    expect(isMacPlatform('Win32', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false);
    expect(isMacPlatform('Linux x86_64', 'Mozilla/5.0 (X11; Linux x86_64)')).toBe(false);
  });

  it('formats save and highlight shortcuts per OS', () => {
    expect(formatSaveShortcut(true)).toBe('⌘↵');
    expect(formatSaveShortcut(false)).toBe('Ctrl+↵');
    expect(formatHighlightShortcut(true)).toBe('⌥⇧H');
    expect(formatHighlightShortcut(false)).toBe('Alt+Shift+H');
  });
});
