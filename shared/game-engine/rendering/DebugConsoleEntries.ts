/**
 * DebugConsoleEntries — Collapsible log entry component for the debug console.
 *
 * Renders timestamped, color-coded, expand/collapse log entries that can be
 * added to any debug tab (Prolog, LLM, Language). Each tab maintains up to
 * MAX_ENTRIES entries with oldest-eviction and auto-scroll-to-newest behavior.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type DebugLogCategory = 'prolog' | 'llm' | 'language' | 'error';

export interface DebugLogEntryData {
  /** Short category tag (e.g., 'Prolog', 'LLM', 'Grammar', 'EVAL') */
  tag: string;
  /** Category for color coding */
  category: DebugLogCategory;
  /** One-line summary shown in collapsed state */
  summary: string;
  /** Multi-line detail shown in expanded state (pre-formatted) */
  detail: string;
  /** Timestamp — defaults to now if not provided */
  timestamp?: Date;
}

// ── Constants ───────────────────────────────────────────────────────────────

const MAX_ENTRIES = 200;

const CATEGORY_COLORS: Record<DebugLogCategory, string> = {
  prolog: '#0f0',
  llm: '#0af',
  language: '#fa0',
  error: '#f44',
};

// ── Per-tab Entry Storage ───────────────────────────────────────────────────

type DebugTab = 'prolog' | 'llm' | 'language';

interface TabEntryStore {
  entries: Array<{ data: DebugLogEntryData; element: HTMLDivElement }>;
  container: HTMLDivElement | null;
  /** True when user has scrolled up (scroll-lock: don't auto-scroll) */
  userScrolledUp: boolean;
}

const _tabStores: Record<DebugTab, TabEntryStore> = {
  prolog: { entries: [], container: null, userScrolledUp: false },
  llm: { entries: [], container: null, userScrolledUp: false },
  language: { entries: [], container: null, userScrolledUp: false },
};

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Create a scrollable entry container for a debug tab.
 * Call once per tab during panel setup.
 */
export function createEntryContainer(tab: DebugTab): HTMLDivElement {
  const container = document.createElement('div');
  container.dataset.scroll = 'true';
  container.dataset.entryContainer = tab;
  container.style.cssText =
    'flex:1;overflow-y:auto;padding:4px 8px;margin:0;max-height:280px;';

  // Track scroll position for scroll-lock behavior
  container.onscroll = () => {
    const store = _tabStores[tab];
    const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 20;
    store.userScrolledUp = !atBottom;
  };

  _tabStores[tab].container = container;
  return container;
}

/**
 * Add a log entry to a tab's entry list.
 * Handles rendering, eviction of oldest entries, and auto-scroll.
 */
export function addDebugLogEntry(tab: DebugTab, data: DebugLogEntryData): HTMLDivElement {
  const store = _tabStores[tab];
  const element = renderLogEntry(data);

  // Evict oldest if at capacity
  if (store.entries.length >= MAX_ENTRIES) {
    const evicted = store.entries.shift();
    if (evicted && store.container) {
      evicted.element.remove();
    }
  }

  store.entries.push({ data, element });

  if (store.container) {
    store.container.appendChild(element);

    // Auto-scroll to newest unless user has scrolled up
    if (!store.userScrolledUp) {
      store.container.scrollTop = store.container.scrollHeight;
    }
  }

  return element;
}

/**
 * Get the number of entries for a tab.
 */
export function getTabEntryCount(tab: DebugTab): number {
  return _tabStores[tab].entries.length;
}

/**
 * Clear all entries for a tab.
 */
export function clearTabEntries(tab: DebugTab): void {
  const store = _tabStores[tab];
  for (const entry of store.entries) {
    entry.element.remove();
  }
  store.entries = [];
  store.userScrolledUp = false;
}

/**
 * Reset all tab stores (called on dispose).
 */
export function disposeEntryStores(): void {
  for (const tab of ['prolog', 'llm', 'language'] as DebugTab[]) {
    _tabStores[tab].entries = [];
    _tabStores[tab].container = null;
    _tabStores[tab].userScrolledUp = false;
  }
}

/**
 * Get the color for a given category.
 */
export function getCategoryColor(category: DebugLogCategory): string {
  return CATEGORY_COLORS[category];
}

// ── Rendering ───────────────────────────────────────────────────────────────

function formatTimestamp(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/**
 * Render a single collapsible log entry as an HTML element.
 */
function renderLogEntry(data: DebugLogEntryData): HTMLDivElement {
  const ts = data.timestamp ?? new Date();
  const color = CATEGORY_COLORS[data.category];

  const wrapper = document.createElement('div');
  wrapper.dataset.logEntry = data.category;
  wrapper.style.cssText =
    'border-bottom:1px solid rgba(255,255,255,0.08);cursor:pointer;';

  // ── Collapsed summary row ─────────────────────────────────────────────
  const summaryRow = document.createElement('div');
  summaryRow.dataset.summaryRow = 'true';
  summaryRow.style.cssText =
    `padding:3px 4px;font:12px monospace;color:${color};` +
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;';

  // Expand/collapse indicator
  const indicator = document.createElement('span');
  indicator.textContent = '▶ ';
  indicator.dataset.indicator = 'true';
  indicator.style.cssText = 'font-size:9px;margin-right:4px;transition:transform 0.1s;display:inline-block;';
  summaryRow.appendChild(indicator);

  // Timestamp
  const tsSpan = document.createElement('span');
  tsSpan.textContent = formatTimestamp(ts);
  tsSpan.style.cssText = 'color:#888;margin-right:6px;';
  summaryRow.appendChild(tsSpan);

  // Tag
  const tagSpan = document.createElement('span');
  tagSpan.textContent = `[${data.tag}]`;
  tagSpan.style.cssText = `color:${color};font-weight:bold;margin-right:6px;`;
  summaryRow.appendChild(tagSpan);

  // Summary text
  const summarySpan = document.createElement('span');
  summarySpan.textContent = data.summary;
  summarySpan.style.cssText = `color:${color};flex:1;overflow:hidden;text-overflow:ellipsis;`;
  summaryRow.appendChild(summarySpan);

  wrapper.appendChild(summaryRow);

  // ── Expandable detail area ────────────────────────────────────────────
  const detailArea = document.createElement('pre');
  detailArea.dataset.detailArea = 'true';
  detailArea.textContent = data.detail;
  detailArea.style.cssText =
    `display:none;padding:4px 8px 6px 20px;margin:0;font:11px monospace;` +
    `color:${color};opacity:0.85;white-space:pre-wrap;word-break:break-all;` +
    'background:rgba(255,255,255,0.03);border-left:2px solid ' + color + ';';

  wrapper.appendChild(detailArea);

  // ── Click to toggle ───────────────────────────────────────────────────
  let expanded = false;
  summaryRow.onclick = () => {
    expanded = !expanded;
    detailArea.style.display = expanded ? 'block' : 'none';
    indicator.textContent = expanded ? '▼ ' : '▶ ';
  };

  return wrapper;
}
