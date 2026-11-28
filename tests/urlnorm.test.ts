import { describe, expect, it } from 'vitest';
import { normalizeUrl, resolveUrl } from '../src/shared/urlnorm';

describe('normalizeUrl parity with ArcMD Go clipper.NormalizeURL', () => {
  it('strips tracking parameters, fragments, trailing slashes, and normalizes host/scheme', () => {
    expect(
      normalizeUrl('HTTPS://Example.COM/post/42/?utm_source=twitter&b=2&a=1&fbclid=xyz#section'),
    ).toBe('https://example.com/post/42?a=1&b=2');
  });

  it('drops default ports and strips spm/from/chksm', () => {
    expect(normalizeUrl('https://mp.weixin.qq.com:443/s/abc/?chksm=123&from=singlemessage')).toBe(
      'https://mp.weixin.qq.com/s/abc',
    );
    expect(normalizeUrl('http://example.com:80/')).toBe('http://example.com/');
  });

  it('preserves meaningful query params sorted deterministically', () => {
    const a = normalizeUrl('https://example.com/search?z=1&q=arcmd&utm_medium=social');
    const b = normalizeUrl('https://example.com/search?q=arcmd&z=1#top');
    expect(a).toBe(b);
    expect(a).toBe('https://example.com/search?q=arcmd&z=1');
  });

  it('resolves relative URLs cleanly', () => {
    expect(resolveUrl('/img/arch.png', 'https://example.com/blog/post')).toBe(
      'https://example.com/img/arch.png',
    );
    expect(resolveUrl('//cdn.example.com/a.jpg', 'https://example.com/blog')).toBe(
      'https://cdn.example.com/a.jpg',
    );
  });
});
