import { describe, expect, it } from 'vitest';
import { extractFromDocument } from '../src/content/extractor';
import { htmlToArcMarkdown } from '../src/shared/markdown';

function makeDoc(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('extractFromDocument site adapters', () => {
  it('extracts WeChat Official Account article metadata and promotes data-src images', () => {
    const doc = makeDoc(`
      <html>
        <head><title>WeChat</title></head>
        <body>
          <h1 id="activity-name">纯 Go 原生富文本引擎</h1>
          <a id="js_name">ArcMD 团队</a>
          <em id="publish_time">2026-11-26</em>
          <div id="js_content">
            <p>第一段正文内容，介绍零 webview 架构。</p>
            <img data-src="https://mmbiz.qpic.cn/mmbiz_png/demo/0?wx_fmt=png" alt="架构图" />
          </div>
        </body>
      </html>
    `);
    const page = extractFromDocument(doc, 'https://mp.weixin.qq.com/s/test123');
    expect(page.title).toBe('纯 Go 原生富文本引擎');
    expect(page.author).toBe('ArcMD 团队');
    expect(page.siteName).toBe('微信公众号');
    expect(page.images.some((i) => i.url.includes('mmbiz.qpic.cn'))).toBe(true);
    const md = htmlToArcMarkdown(page.articleHtml, { baseUrl: page.url });
    expect(md).toContain('![架构图](https://mmbiz.qpic.cn/mmbiz_png/demo/0?wx_fmt=png)');
  });

  it('extracts Zhihu columns with lazy images and formulas', () => {
    const doc = makeDoc(`
      <html>
        <head><title>Zhihu</title></head>
        <body>
          <h1 class="Post-Title">深入理解公式排版</h1>
          <span class="AuthorInfo-name">知乎作者</span>
          <div class="Post-RichTextContainer">
            <p>核心公式 <span class="ztext-math" data-tex="a^2 + b^2 = c^2"></span></p>
            <img data-actualsrc="https://pic1.zhimg.com/v2-demo.jpg" alt="示意图" />
          </div>
        </body>
      </html>
    `);
    const page = extractFromDocument(doc, 'https://zhuanlan.zhihu.com/p/999');
    expect(page.title).toBe('深入理解公式排版');
    expect(page.author).toBe('知乎作者');
    const md = htmlToArcMarkdown(page.articleHtml, { baseUrl: page.url });
    expect(md).toContain('$a^2 + b^2 = c^2$');
    expect(md).toContain('https://pic1.zhimg.com/v2-demo.jpg');
  });

  it('extracts GitHub README without anchor links', () => {
    const doc = makeDoc(`
      <html>
        <head><meta property="og:title" content="Ciao1019/ArcMD" /></head>
        <body>
          <article class="markdown-body">
            <h1><a class="anchor" href="#arcmd">#</a>ArcMD</h1>
            <p>Native Go Markdown workspace.</p>
          </article>
        </body>
      </html>
    `);
    const page = extractFromDocument(doc, 'https://github.com/Ciao1019/ArcMD');
    expect(page.siteName).toBe('GitHub');
    const md = htmlToArcMarkdown(page.articleHtml, { baseUrl: page.url });
    expect(md).toContain('# ArcMD');
    expect(md).toContain('Native Go Markdown workspace.');
  });

  it('preserves Go code fence language, task checkboxes, formula, table, and details across Readability', () => {
    const doc = makeDoc(`
      <html>
        <head>
          <title>ArcMD 剪藏实机测试</title>
          <meta name="author" content="ArcMD Tester" />
        </head>
        <body>
          <article>
            <h1>ArcMD 剪藏实机测试</h1>
            <p>这是一篇用于端到端实机验证的文章正文，包含表格、代码块、任务列表、数学公式和折叠块内容，确保 Readability 完整识别正文区域。</p>
            <table>
              <tr><th>组件</th><th>语言</th></tr>
              <tr><td>宿主</td><td>Go</td></tr>
            </table>
            <pre><code class="language-go">func main() {}</code></pre>
            <ul>
              <li><input type="checkbox" checked /> 已完成</li>
              <li><input type="checkbox" /> 待处理</li>
            </ul>
            <p>公式 <span data-formula="E = mc^2"></span></p>
            <details><summary>更多细节</summary><p>折叠说明文字。</p></details>
          </article>
        </body>
      </html>
    `);
    const page = extractFromDocument(doc, 'http://127.0.0.1:18923/article');
    const md = htmlToArcMarkdown(page.articleHtml, { baseUrl: page.url });
    expect(md).toContain('```go\nfunc main() {}\n```');
    expect(md).toContain('- [x] 已完成');
    expect(md).toContain('- [ ] 待处理');
    expect(md).toContain('$E = mc^2$');
    expect(md).toContain('| 组件 | 语言 |');
    expect(md).toContain('<details>\n<summary>更多细节</summary>');
  });
});
