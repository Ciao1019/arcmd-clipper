import { describe, expect, it } from 'vitest';
import { htmlToArcMarkdown } from '../src/shared/markdown';

describe('htmlToArcMarkdown', () => {
  it('converts GFM tables, fenced code languages, task lists, strikethrough, and details', () => {
    const html = `
      <h2>Summary</h2>
      <p>Old <del>approach</del> vs <mark data-color="green">ArcMD native</mark>.</p>
      <pre><code class="language-go">func main() {\n  println("hi")\n}</code></pre>
      <ul>
        <li><input type="checkbox" checked /> Done item</li>
        <li><input type="checkbox" /> Todo item</li>
      </ul>
      <table>
        <tr><th>Name</th><th>Status</th></tr>
        <tr><td>Clipper</td><td>Ready</td></tr>
      </table>
      <details><summary>More info</summary><p>Hidden body</p></details>
    `;
    const md = htmlToArcMarkdown(html, { baseUrl: 'https://example.com/post' });
    expect(md).toContain('## Summary');
    expect(md).toContain('~~approach~~');
    expect(md).toContain('<mark style="background-color:#CCF3C8" data-highlight="light-green">ArcMD native</mark>');
    expect(md).toContain('```go\nfunc main()');
    expect(md).toContain('- [x] Done item');
    expect(md).toContain('- [ ] Todo item');
    expect(md).toContain('| Name | Status |');
    expect(md).toContain('| Clipper | Ready |');
    expect(md).toContain('<details>\n<summary>More info</summary>');
  });

  it('preserves KaTeX & Zhihu math formulas as TeX delimiters', () => {
    const html = `
      <p>Inline <span data-formula="E = mc^2"></span></p>
      <div class="katex-display"><annotation encoding="application/x-tex">\\int_0^1 x^2 dx</annotation></div>
    `;
    const md = htmlToArcMarkdown(html, { baseUrl: 'https://zhihu.com/p/1' });
    expect(md).toContain('$E = mc^2$');
    expect(md).toContain('$$\n\\int_0^1 x^2 dx\n$$');
  });

  it('extracts lazy image data-src and rewrites localized imageMap paths', () => {
    const html = `<p><img data-src="https://mmbiz.qpic.cn/a.png" src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" alt="Arch" /></p>`;
    const md = htmlToArcMarkdown(html, {
      baseUrl: 'https://mp.weixin.qq.com/s/1',
      imageMap: { 'https://mmbiz.qpic.cn/a.png': 'assets/clip-1.png' },
    });
    expect(md).toBe('![Arch](assets/clip-1.png)');
  });
});
