import type { HighlightColor, WebHighlight } from '../shared/types';

const HOST_ID = 'arcmd-clipper-host';
const STYLE_ID = 'arcmd-clipper-hl-style';

const COLORS: { id: HighlightColor; label: string; bg: string; ring: string }[] = [
  { id: 'yellow', label: '明黄', bg: '#fef08a', ring: '#eab308' },
  { id: 'green', label: '薄荷绿', bg: '#bbf7d0', ring: '#22c55e' },
  { id: 'blue', label: '晴空蓝', bg: '#bfdbfe', ring: '#3b82f6' },
  { id: 'pink', label: '樱花粉', bg: '#fbcfe8', ring: '#ec4899' },
];

interface TextRun {
  node: Text;
  start: number;
  end: number;
}

export class WebHighlighter {
  private active = false;
  private highlights: WebHighlight[] = [];
  private host: HTMLDivElement | null = null;
  private shadow: ShadowRoot | null = null;
  private toolbarEl: HTMLDivElement | null = null;
  private pillEl: HTMLDivElement | null = null;
  private noteRowEl: HTMLDivElement | null = null;
  private noteInputEl: HTMLInputElement | null = null;
  private deleteBtnEl: HTMLButtonElement | null = null;
  private pendingRange: Range | null = null;
  private editingId: string | null = null;
  private onChange: (highlights: WebHighlight[]) => void;

  constructor(onChange: (highlights: WebHighlight[]) => void) {
    this.onChange = onChange;
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleClickOutside = this.handleClickOutside.bind(this);
  }

  public isActive(): boolean {
    return this.active;
  }

  public getHighlights(): WebHighlight[] {
    return this.highlights.map((h) => ({ ...h }));
  }

  public setHighlights(list: WebHighlight[]): void {
    this.highlights = Array.isArray(list) ? list.map((h) => ({ ...h })) : [];
    this.ensureMarkStyles();
    this.clearMarksFromDOM();
    for (const hl of this.highlights) {
      this.applyHighlightToDOM(hl);
    }
    this.updatePill();
  }

  public toggle(): boolean {
    return this.setActive(!this.active);
  }

  public setActive(next: boolean): boolean {
    this.active = next;
    this.ensureHost();
    if (this.active) {
      document.addEventListener('mouseup', this.handleMouseUp, true);
      document.addEventListener('keydown', this.handleKeyDown, true);
      document.addEventListener('mousedown', this.handleClickOutside, true);
    } else {
      document.removeEventListener('mouseup', this.handleMouseUp, true);
      document.removeEventListener('keydown', this.handleKeyDown, true);
      document.removeEventListener('mousedown', this.handleClickOutside, true);
      this.hideToolbar();
    }
    this.updatePill();
    return this.active;
  }

  public clearAll(): void {
    this.highlights = [];
    this.clearMarksFromDOM();
    this.hideToolbar();
    this.updatePill();
    this.onChange([]);
  }

  private ensureMarkStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      mark.arcmd-clip-hl {
        border-radius: 3px;
        padding: 0 2px;
        color: inherit;
        cursor: pointer;
        transition: filter 120ms ease;
      }
      mark.arcmd-clip-hl:hover { filter: brightness(0.95); }
      mark.arcmd-clip-hl[data-arcmd-color="yellow"] { background: rgba(254, 240, 138, 0.78); }
      mark.arcmd-clip-hl[data-arcmd-color="green"] { background: rgba(187, 247, 208, 0.78); }
      mark.arcmd-clip-hl[data-arcmd-color="blue"] { background: rgba(191, 219, 254, 0.8); }
      mark.arcmd-clip-hl[data-arcmd-color="pink"] { background: rgba(251, 207, 232, 0.8); }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  private ensureHost(): void {
    this.ensureMarkStyles();
    if (this.host && this.shadow) return;

    const existing = document.getElementById(HOST_ID);
    if (existing) existing.remove();

    const host = document.createElement('div');
    host.id = HOST_ID;
    host.style.position = 'fixed';
    host.style.zIndex = '2147483646';
    host.style.top = '0';
    host.style.left = '0';
    host.style.width = '0';
    host.style.height = '0';
    host.style.pointerEvents = 'none';
    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif; }
      .toolbar {
        position: fixed;
        display: none;
        flex-direction: column;
        gap: 6px;
        background: #18181b;
        color: #f4f4f5;
        padding: 7px 9px;
        border-radius: 12px;
        box-shadow: 0 12px 28px rgba(0,0,0,0.28), 0 0 0 1px rgba(255,255,255,0.08);
        pointer-events: auto;
        z-index: 2147483647;
      }
      .toolbar.open { display: flex; }
      .row { display: flex; align-items: center; gap: 7px; }
      .dot {
        width: 18px;
        height: 18px;
        border-radius: 999px;
        border: 2px solid transparent;
        cursor: pointer;
        padding: 0;
        transition: transform 120ms ease;
      }
      .dot:hover { transform: scale(1.14); }
      .btn {
        background: rgba(255,255,255,0.1);
        color: #e4e4e7;
        border: none;
        border-radius: 7px;
        padding: 3px 8px;
        font-size: 12px;
        cursor: pointer;
      }
      .btn:hover { background: rgba(255,255,255,0.18); }
      .btn.danger { color: #fca5a5; }
      .note-row { display: none; align-items: center; gap: 6px; }
      .note-row.open { display: flex; }
      .note-input {
        width: 188px;
        background: rgba(255,255,255,0.1);
        border: 1px solid rgba(255,255,255,0.16);
        border-radius: 7px;
        color: #fff;
        font-size: 12px;
        padding: 4px 8px;
        outline: none;
      }
      .note-input:focus { border-color: #60a5fa; }
      .pill {
        position: fixed;
        right: 18px;
        bottom: 18px;
        display: none;
        align-items: center;
        gap: 10px;
        background: rgba(24, 24, 27, 0.92);
        color: #f4f4f5;
        padding: 8px 13px;
        border-radius: 999px;
        font-size: 12px;
        box-shadow: 0 10px 24px rgba(0,0,0,0.22), 0 0 0 1px rgba(255,255,255,0.1);
        pointer-events: auto;
        backdrop-filter: blur(8px);
      }
      .pill.open { display: flex; }
      .badge {
        background: #3b82f6;
        color: #fff;
        font-weight: 600;
        border-radius: 999px;
        padding: 1px 7px;
        font-size: 11px;
      }
      .exit {
        background: rgba(255,255,255,0.12);
        color: #fff;
        border: none;
        border-radius: 999px;
        padding: 3px 9px;
        font-size: 11px;
        cursor: pointer;
      }
      .exit:hover { background: rgba(255,255,255,0.22); }
    `;
    shadow.appendChild(style);

    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    const topRow = document.createElement('div');
    topRow.className = 'row';

    for (const c of COLORS) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'dot';
      dot.title = c.label;
      dot.style.background = c.bg;
      dot.style.borderColor = c.ring;
      dot.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.applyColorChoice(c.id);
      });
      topRow.appendChild(dot);
    }

    const noteBtn = document.createElement('button');
    noteBtn.type = 'button';
    noteBtn.className = 'btn';
    noteBtn.textContent = '批注';
    noteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.noteRowEl?.classList.toggle('open');
      if (this.noteRowEl?.classList.contains('open')) {
        this.noteInputEl?.focus();
      }
    });
    topRow.appendChild(noteBtn);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn danger';
    delBtn.textContent = '删除';
    delBtn.style.display = 'none';
    delBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.editingId) {
        this.removeHighlight(this.editingId);
      }
    });
    topRow.appendChild(delBtn);

    const noteRow = document.createElement('div');
    noteRow.className = 'note-row';
    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.className = 'note-input';
    noteInput.placeholder = '输入批注，回车保存…';
    noteInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.saveNote();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.hideToolbar();
      }
    });
    const noteSave = document.createElement('button');
    noteSave.type = 'button';
    noteSave.className = 'btn';
    noteSave.textContent = '保存';
    noteSave.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.saveNote();
    });
    noteRow.append(noteInput, noteSave);

    toolbar.append(topRow, noteRow);

    const pill = document.createElement('div');
    pill.className = 'pill';
    pill.innerHTML = `<span>ArcMD 高亮模式</span><span class="badge" data-count>0</span><button type="button" class="exit">退出 (Esc)</button>`;
    pill.querySelector('.exit')?.addEventListener('click', () => this.setActive(false));

    shadow.append(toolbar, pill);
    document.documentElement.appendChild(host);

    this.host = host;
    this.shadow = shadow;
    this.toolbarEl = toolbar;
    this.pillEl = pill;
    this.noteRowEl = noteRow;
    this.noteInputEl = noteInput;
    this.deleteBtnEl = delBtn;

    // Allow clicking existing highlights even when highlight mode is toggled off
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      const mark = target?.closest?.('mark.arcmd-clip-hl') as HTMLElement | null;
      if (!mark) return;
      const id = mark.getAttribute('data-arcmd-id');
      if (!id) return;
      const hl = this.highlights.find((h) => h.id === id);
      if (!hl) return;
      e.stopPropagation();
      this.editingId = id;
      this.pendingRange = null;
      const rect = mark.getBoundingClientRect();
      this.showToolbarAt(rect, hl.note || '', true);
    });
  }

  private updatePill(): void {
    if (!this.pillEl) return;
    this.pillEl.classList.toggle('open', this.active);
    const badge = this.pillEl.querySelector('[data-count]');
    if (badge) badge.textContent = String(this.highlights.length);
  }

  private showToolbarAt(rect: DOMRect, noteValue: string, isEditing: boolean): void {
    this.ensureHost();
    if (!this.toolbarEl || !this.noteInputEl || !this.noteRowEl || !this.deleteBtnEl) return;
    const x = Math.max(12, Math.min(window.innerWidth - 250, rect.left + rect.width / 2 - 110));
    const y = Math.max(12, rect.top > 72 ? rect.top - 48 : rect.bottom + 8);
    this.toolbarEl.style.left = `${x}px`;
    this.toolbarEl.style.top = `${y}px`;
    this.noteInputEl.value = noteValue;
    this.noteRowEl.classList.toggle('open', Boolean(noteValue));
    this.deleteBtnEl.style.display = isEditing ? 'inline-block' : 'none';
    this.toolbarEl.classList.add('open');
  }

  private hideToolbar(): void {
    this.toolbarEl?.classList.remove('open');
    this.noteRowEl?.classList.remove('open');
    this.pendingRange = null;
    this.editingId = null;
  }

  private handleMouseUp(e: MouseEvent): void {
    if (this.host && e.composedPath().includes(this.host)) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const text = sel.toString().trim();
    if (!text) return;
    const range = sel.getRangeAt(0).cloneRange();
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    this.pendingRange = range;
    this.editingId = null;
    this.showToolbarAt(rect, '', false);
  }

  private handleClickOutside(e: MouseEvent): void {
    if (this.host && e.composedPath().includes(this.host)) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest?.('mark.arcmd-clip-hl')) return;
    this.hideToolbar();
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this.toolbarEl?.classList.contains('open')) {
        this.hideToolbar();
      } else if (this.active) {
        this.setActive(false);
      }
    }
  }

  private applyColorChoice(color: HighlightColor): void {
    if (this.editingId) {
      const idx = this.highlights.findIndex((h) => h.id === this.editingId);
      if (idx >= 0) {
        this.highlights[idx] = { ...this.highlights[idx], color };
        document
          .querySelectorAll(`mark.arcmd-clip-hl[data-arcmd-id="${CSS.escape(this.editingId)}"]`)
          .forEach((m) => m.setAttribute('data-arcmd-color', color));
        this.onChange(this.getHighlights());
      }
      this.hideToolbar();
      return;
    }

    if (!this.pendingRange) return;
    const note = this.noteInputEl?.value.trim() || '';
    const created = this.createHighlightFromRange(this.pendingRange, color, note);
    if (created) {
      window.getSelection()?.removeAllRanges();
      this.highlights.push(created);
      this.applyHighlightToDOM(created);
      this.updatePill();
      this.onChange(this.getHighlights());
    }
    this.hideToolbar();
  }

  private saveNote(): void {
    const note = this.noteInputEl?.value.trim() || '';
    if (this.editingId) {
      const idx = this.highlights.findIndex((h) => h.id === this.editingId);
      if (idx >= 0) {
        this.highlights[idx] = { ...this.highlights[idx], note };
        document
          .querySelectorAll(`mark.arcmd-clip-hl[data-arcmd-id="${CSS.escape(this.editingId)}"]`)
          .forEach((m) => m.setAttribute('title', note));
        this.onChange(this.getHighlights());
      }
      this.hideToolbar();
      return;
    }
    // If creating a new highlight directly via Enter in note box, default to yellow.
    if (this.pendingRange) {
      this.applyColorChoice('yellow');
    }
  }

  private removeHighlight(id: string): void {
    this.highlights = this.highlights.filter((h) => h.id !== id);
    document
      .querySelectorAll(`mark.arcmd-clip-hl[data-arcmd-id="${CSS.escape(id)}"]`)
      .forEach((mark) => {
        const parent = mark.parentNode;
        if (!parent) return;
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
        parent.normalize();
      });
    this.hideToolbar();
    this.updatePill();
    this.onChange(this.getHighlights());
  }

  private collectTextRuns(): { fullText: string; runs: TextRun[] } {
    const runs: TextRun[] = [];
    let fullText = '';
    const root = document.body;
    if (!root) return { fullText, runs };

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEXTAREA') {
          return NodeFilter.FILTER_REJECT;
        }
        if (parent.closest(`#${HOST_ID}`)) return NodeFilter.FILTER_REJECT;
        return (node.nodeValue || '').length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });

    let current: Node | null;
    while ((current = walker.nextNode())) {
      const textNode = current as Text;
      const val = textNode.nodeValue || '';
      const start = fullText.length;
      fullText += val;
      runs.push({ node: textNode, start, end: fullText.length });
    }
    return { fullText, runs };
  }

  private createHighlightFromRange(range: Range, color: HighlightColor, note: string): WebHighlight | null {
    const exact = range.toString().trim();
    if (!exact) return null;
    const { fullText, runs } = this.collectTextRuns();
    let offset = -1;
    for (const r of runs) {
      if (r.node === range.startContainer) {
        offset = r.start + range.startOffset;
        break;
      }
    }
    if (offset < 0) {
      offset = fullText.indexOf(exact);
    }
    const prefix = offset > 0 ? fullText.slice(Math.max(0, offset - 32), offset) : '';
    const suffix = offset >= 0 ? fullText.slice(offset + exact.length, offset + exact.length + 32) : '';
    return {
      id: `hl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      exact,
      prefix,
      suffix,
      color,
      note: note || undefined,
      createdAt: new Date().toISOString(),
    };
  }

  private clearMarksFromDOM(): void {
    document.querySelectorAll('mark.arcmd-clip-hl').forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize();
    });
  }

  private applyHighlightToDOM(hl: WebHighlight): void {
    if (!hl.exact) return;
    const { fullText, runs } = this.collectTextRuns();
    if (!fullText) return;

    // Find best occurrence using prefix + suffix context scoring.
    let bestIdx = -1;
    let bestScore = -1;
    let searchFrom = 0;
    while (searchFrom < fullText.length) {
      const idx = fullText.indexOf(hl.exact, searchFrom);
      if (idx < 0) break;
      let score = 0;
      if (hl.prefix) {
        const before = fullText.slice(Math.max(0, idx - hl.prefix.length), idx);
        if (before === hl.prefix) score += 2;
        else if (before.endsWith(hl.prefix.slice(-10))) score += 1;
      }
      if (hl.suffix) {
        const after = fullText.slice(idx + hl.exact.length, idx + hl.exact.length + hl.suffix.length);
        if (after === hl.suffix) score += 2;
        else if (after.startsWith(hl.suffix.slice(0, 10))) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
      searchFrom = idx + 1;
    }
    if (bestIdx < 0) return;

    const rangeStart = bestIdx;
    const rangeEnd = bestIdx + hl.exact.length;

    // Wrap intersecting text runs from back to front so DOM mutations don't invalidate earlier nodes.
    const intersecting = runs.filter((r) => r.end > rangeStart && r.start < rangeEnd);
    for (let i = intersecting.length - 1; i >= 0; i--) {
      const run = intersecting[i];
      const localStart = Math.max(0, rangeStart - run.start);
      const localEnd = Math.min(run.node.length, rangeEnd - run.start);
      if (localEnd <= localStart) continue;
      try {
        let targetNode = run.node;
        if (localEnd < targetNode.length) {
          targetNode.splitText(localEnd);
        }
        if (localStart > 0) {
          targetNode = targetNode.splitText(localStart);
        }
        const mark = document.createElement('mark');
        mark.className = 'arcmd-clip-hl';
        mark.setAttribute('data-arcmd-id', hl.id);
        mark.setAttribute('data-arcmd-color', hl.color || 'yellow');
        if (hl.note) mark.setAttribute('title', hl.note);
        targetNode.parentNode?.insertBefore(mark, targetNode);
        mark.appendChild(targetNode);
      } catch {
        // Ignore nodes that cannot be wrapped cleanly
      }
    }
  }
}
