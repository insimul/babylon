/**
 * PrologDebugger — In-game Prolog knowledge base inspector.
 *
 * When debug mode is active, provides:
 *   1. Entity hover enrichment: shows Prolog facts about hovered NPCs,
 *      buildings, items, and world objects in the debug tooltip.
 *   2. Interactive query panel: a collapsible panel for running ad-hoc
 *      Prolog queries against the live knowledge base.
 *
 * Activated via the existing Debug toggle (Game Menu > System > Debug).
 */

import type { GamePrologEngine } from '../logic/GamePrologEngine';
import { addDebugLogEntry, createEntryContainer, disposeEntryStores } from './DebugConsoleEntries';
import { getDebugEventBus, resetDebugEventBus } from '../debug-event-bus';
import type { DebugEvent } from '../debug-event-bus';
export { addDebugLogEntry, getTabEntryCount, clearTabEntries, getCategoryColor } from './DebugConsoleEntries';
export type { DebugLogCategory, DebugLogEntryData } from './DebugConsoleEntries';
export { getDebugEventBus, resetDebugEventBus } from '../debug-event-bus';
export type { DebugEvent, DebugEventBus, DebugEventCallback } from '../debug-event-bus';

// ── Entity Hover Enrichment ─────────────────────────────────────────────────

/**
 * Extract the Prolog entity identifier from a mesh's metadata.
 * Returns the atom used in the knowledge base, or null if not identifiable.
 */
function extractEntityAtom(metadata: Record<string, any> | null): {
  atom: string;
  entityType: string;
} | null {
  if (!metadata) return null;

  if (metadata.npcId) {
    return { atom: sanitize(metadata.npcId), entityType: 'character' };
  }
  if (metadata.businessId) {
    return { atom: sanitize(metadata.businessId), entityType: 'business' };
  }
  if (metadata.residenceId) {
    return { atom: sanitize(metadata.residenceId), entityType: 'residence' };
  }
  if (metadata.settlementId) {
    return { atom: sanitize(metadata.settlementId), entityType: 'settlement' };
  }
  if (metadata.containerId) {
    return { atom: sanitize(metadata.containerId), entityType: 'container' };
  }
  if (metadata.itemId) {
    return { atom: sanitize(metadata.itemId), entityType: 'item' };
  }
  if (metadata.objectRole) {
    return { atom: sanitize(metadata.objectRole), entityType: 'object' };
  }

  return null;
}

/**
 * Query Prolog for all known facts about an entity.
 * Returns a formatted multi-line string for display in the debug tooltip.
 */
export async function queryEntityFacts(
  engine: GamePrologEngine,
  metadata: Record<string, any> | null,
): Promise<string | null> {
  const entity = extractEntityAtom(metadata);
  if (!entity) return null;

  const lines: string[] = [];
  lines.push(`--- Prolog (${entity.entityType}) ---`);

  try {
    // Query predicates that commonly use this entity's atom
    const predicateQueries = getPredicateQueriesForType(entity.entityType, entity.atom);

    for (const { label, query } of predicateQueries) {
      try {
        const results = await engine.query(query);
        if (results && results.length > 0) {
          for (const result of results) {
            const values = Object.entries(result)
              .filter(([k]) => k !== entity.atom)
              .map(([k, v]) => `${k}=${v}`)
              .join(', ');
            lines.push(`  ${label}: ${values || 'true'}`);
          }
        }
      } catch {
        // Query failed — predicate may not exist, skip silently
      }
    }

    // Also check quest-related facts about this entity
    try {
      const questResults = await engine.query(
        `quest_objective(QuestId, Idx, Goal)`, 5,
      );
      // Filter for goals mentioning this entity (heuristic)
      // This is best-effort since goal terms vary
    } catch { /* skip */ }
  } catch {
    lines.push('  (query error)');
  }

  return lines.length > 1 ? lines.join('\n') : null;
}

/**
 * Get a list of Prolog queries relevant to a given entity type.
 */
function getPredicateQueriesForType(
  entityType: string,
  atom: string,
): Array<{ label: string; query: string }> {
  switch (entityType) {
    case 'character':
      return [
        { label: 'name', query: `name(${atom}, Name)` },
        { label: 'occupation', query: `occupation(${atom}, Occ)` },
        { label: 'age', query: `age(${atom}, Age)` },
        { label: 'gender', query: `gender(${atom}, G)` },
        { label: 'alive', query: `alive(${atom})` },
        { label: 'mood', query: `mood(${atom}, Mood)` },
        { label: 'personality', query: `personality(${atom}, Trait, Value)` },
        { label: 'skill', query: `skill(${atom}, Skill, Level)` },
        { label: 'location', query: `current_location(${atom}, Loc)` },
        { label: 'home', query: `home(${atom}, Res)` },
        { label: 'workplace', query: `workplace(${atom}, Biz)` },
        { label: 'married', query: `married_to(${atom}, Spouse)` },
        { label: 'friend', query: `friends(${atom}, Friend)` },
        { label: 'enemy', query: `enemies(${atom}, Enemy)` },
        { label: 'knows', query: `knows(${atom}, Topic)` },
        { label: 'physical', query: `physical_trait(${atom}, Trait)` },
        { label: 'mental', query: `mental_trait(${atom}, Trait)` },
        { label: 'thinks', query: `has_thought(${atom}, Content)` },
      ];

    case 'business':
      return [
        { label: 'name', query: `business_name(${atom}, Name)` },
        { label: 'type', query: `business_type(${atom}, Type)` },
        { label: 'owner', query: `business_owner(${atom}, Owner)` },
        { label: 'settlement', query: `business_of_settlement(${atom}, Sett)` },
        { label: 'closed', query: `business_out_of_business(${atom})` },
      ];

    case 'residence':
      return [
        { label: 'type', query: `residence_type(${atom}, Type)` },
        { label: 'address', query: `residence_address(${atom}, Addr)` },
        { label: 'owner', query: `residence_owner(${atom}, Owner)` },
        { label: 'resident', query: `lives_at(Resident, ${atom})` },
        { label: 'settlement', query: `residence_of_settlement(${atom}, Sett)` },
      ];

    case 'settlement':
      return [
        { label: 'name', query: `settlement_name(${atom}, Name)` },
        { label: 'type', query: `settlement_type(${atom}, Type)` },
        { label: 'population', query: `settlement_population(${atom}, Pop)` },
        { label: 'district', query: `settlement_district(${atom}, Dist)` },
        { label: 'landmark', query: `settlement_landmark(${atom}, Lm)` },
        { label: 'country', query: `settlement_of_country(${atom}, C)` },
      ];

    case 'container':
      return [
        { label: 'name', query: `container_name(${atom}, Name)` },
        { label: 'type', query: `container_type(${atom}, Type)` },
        { label: 'locked', query: `container_locked(${atom})` },
        { label: 'contains', query: `container_contains(${atom}, Item, Qty)` },
        { label: 'accessible', query: `container_accessible(player, ${atom})` },
      ];

    case 'item':
      return [
        { label: 'name', query: `item_name(${atom}, Name)` },
        { label: 'type', query: `item_type(${atom}, Type)` },
        { label: 'value', query: `item_value(${atom}, V)` },
        { label: 'player has', query: `has(player, ${atom})` },
      ];

    default:
      return [];
  }
}

// ── Interactive Query Panel ─────────────────────────────────────────────────

let _panelDiv: HTMLDivElement | null = null;
let _inputEl: HTMLInputElement | null = null;
let _outputEl: HTMLPreElement | null = null;
let _historyEl: HTMLDivElement | null = null;
let _prologEngine: GamePrologEngine | null = null;
const _queryHistory: string[] = [];
let _historyIndex = -1;
let _busUnsubscribe: (() => void) | null = null;

/**
 * Map DebugEvent category to the corresponding debug console tab.
 */
function categoryToTab(category: DebugEvent['category']): 'prolog' | 'llm' | 'language' {
  switch (category) {
    case 'prolog': return 'prolog';
    case 'llm': return 'llm';
    case 'language': return 'language';
    case 'error': return 'llm'; // errors default to LLM tab (most common source)
  }
}

/**
 * Bridge: subscribe to DebugEventBus and forward events to the UI via addDebugLogEntry().
 */
function connectEventBusToUI(): void {
  if (_busUnsubscribe) return; // already connected
  const bus = getDebugEventBus();
  _busUnsubscribe = bus.subscribe((event: DebugEvent) => {
    const tab = categoryToTab(event.category);
    addDebugLogEntry(tab, {
      tag: event.tag,
      category: event.category,
      summary: event.summary,
      detail: event.detail,
      timestamp: new Date(event.timestamp),
    });
  });
}

// ── Tab System State ────────────────────────────────────────────────────────

type DebugTab = 'prolog' | 'llm' | 'language';

let _activeTab: DebugTab = 'prolog';
let _tabBtns: Record<DebugTab, HTMLButtonElement> | null = null;
let _tabPanels: Record<DebugTab, HTMLDivElement> | null = null;
let _titleLabel: HTMLSpanElement | null = null;

// Scroll position preservation per tab
const _scrollPositions: Record<DebugTab, number> = { prolog: 0, llm: 0, language: 0 };

const TAB_LABELS: Record<DebugTab, string> = {
  prolog: 'Prolog',
  llm: 'LLM',
  language: 'Language',
};

/**
 * Switch active debug console tab, preserving scroll positions.
 */
export function switchDebugTab(tab: DebugTab): void {
  if (!_tabPanels || !_tabBtns || tab === _activeTab) return;

  // Save scroll position of outgoing tab
  const outgoing = _tabPanels[_activeTab];
  const scrollable = outgoing.querySelector('[data-scroll]') as HTMLElement | null;
  if (scrollable) _scrollPositions[_activeTab] = scrollable.scrollTop;

  // Hide outgoing, show incoming
  outgoing.style.display = 'none';
  _tabBtns[_activeTab].style.borderBottom = '2px solid transparent';
  _tabBtns[_activeTab].style.color = '#060';

  _activeTab = tab;
  const incoming = _tabPanels[tab];
  incoming.style.display = 'flex';
  _tabBtns[tab].style.borderBottom = '2px solid #0f0';
  _tabBtns[tab].style.color = '#0f0';

  // Restore scroll position of incoming tab
  const inScrollable = incoming.querySelector('[data-scroll]') as HTMLElement | null;
  if (inScrollable) inScrollable.scrollTop = _scrollPositions[tab];

  // Update title
  if (_titleLabel) _titleLabel.textContent = `Debug Console — ${TAB_LABELS[tab]}`;
}

/**
 * Get the currently active debug tab.
 */
export function getActiveDebugTab(): DebugTab {
  return _activeTab;
}

/**
 * Create and show the unified debug console panel.
 */
export function showPrologDebugPanel(
  container: HTMLElement,
  engine: GamePrologEngine,
): void {
  _prologEngine = engine;

  // Connect event bus → UI bridge
  connectEventBusToUI();

  if (_panelDiv) {
    _panelDiv.style.display = 'flex';
    return;
  }

  const panel = document.createElement('div');
  panel.id = 'prolog-debug-panel';
  panel.style.cssText =
    'position:absolute;bottom:10px;left:50%;transform:translateX(-50%);width:480px;max-height:400px;' +
    'background:rgba(0,0,0,0.92);color:#0f0;font:13px monospace;' +
    'border:1px solid #0f0;border-radius:8px;z-index:2000;' +
    'display:flex;flex-direction:column;overflow:hidden;';

  // Title bar
  const titleBar = document.createElement('div');
  titleBar.style.cssText =
    'padding:6px 10px;background:rgba(0,80,0,0.5);display:flex;' +
    'justify-content:space-between;align-items:center;cursor:move;' +
    'border-bottom:1px solid #0f0;user-select:none;';
  const titleLabel = document.createElement('span');
  titleLabel.style.fontWeight = 'bold';
  titleLabel.textContent = 'Debug Console — Prolog';
  titleBar.appendChild(titleLabel);
  _titleLabel = titleLabel;

  // Collapse button
  const collapseBtn = document.createElement('button');
  collapseBtn.textContent = '_';
  collapseBtn.style.cssText =
    'background:none;border:1px solid #0f0;color:#0f0;cursor:pointer;' +
    'font:bold 13px monospace;padding:0 6px;border-radius:3px;';
  collapseBtn.onclick = () => {
    const bodyEl = panel.querySelector('#prolog-debug-body') as HTMLElement;
    if (bodyEl) bodyEl.style.display = bodyEl.style.display === 'none' ? 'flex' : 'none';
  };
  titleBar.appendChild(collapseBtn);
  panel.appendChild(titleBar);

  // ── Tab Bar ──────────────────────────────────────────────────────────────
  const tabBar = document.createElement('div');
  tabBar.style.cssText =
    'display:flex;border-bottom:1px solid #060;background:rgba(0,0,0,0.8);';

  const tabs: DebugTab[] = ['prolog', 'llm', 'language'];
  const tabBtns = {} as Record<DebugTab, HTMLButtonElement>;

  for (const tab of tabs) {
    const btn = document.createElement('button');
    btn.textContent = TAB_LABELS[tab];
    btn.dataset.tab = tab;
    btn.style.cssText =
      'flex:1;background:none;border:none;border-bottom:2px solid transparent;' +
      'color:#060;font:12px monospace;padding:5px 8px;cursor:pointer;';
    if (tab === 'prolog') {
      btn.style.borderBottom = '2px solid #0f0';
      btn.style.color = '#0f0';
    }
    btn.onclick = () => switchDebugTab(tab);
    tabBar.appendChild(btn);
    tabBtns[tab] = btn;
  }
  _tabBtns = tabBtns;
  panel.appendChild(tabBar);

  // ── Body (contains all tab panels) ───────────────────────────────────────
  const body = document.createElement('div');
  body.id = 'prolog-debug-body';
  body.style.cssText = 'display:flex;flex-direction:column;flex:1;overflow:hidden;';

  // ── Prolog Tab Panel ─────────────────────────────────────────────────────
  const prologPanel = document.createElement('div');
  prologPanel.dataset.tabPanel = 'prolog';
  prologPanel.style.cssText = 'display:flex;flex-direction:column;flex:1;overflow:hidden;';

  // Live event feed + query output area
  const output = document.createElement('pre');
  output.dataset.scroll = 'true';
  output.style.cssText =
    'flex:1;overflow-y:auto;padding:8px;margin:0;font:12px monospace;' +
    'color:#0f0;max-height:280px;white-space:pre-wrap;word-break:break-all;';
  output.textContent = '% Prolog Debug Console — live event feed\n% Player actions, fact assertions, and quest evaluations appear here.\n% Type a query below and press Enter to inspect the knowledge base.\n';
  prologPanel.appendChild(output);
  _outputEl = output;

  // Subscribe to debug events and show them in the output area
  const prologBusSub = getDebugEventBus().subscribe((event: DebugEvent) => {
    if (event.category !== 'prolog') return;
    if (!_outputEl) return;
    // Color-code by tag
    const prefix = event.tag === 'Assert' ? '\x1b[32m' : event.tag === 'Retract' ? '\x1b[31m' : '';
    _outputEl.textContent += `${event.summary}\n`;
    _outputEl.scrollTop = _outputEl.scrollHeight;
  });

  // Quick-action buttons
  const quickBar = document.createElement('div');
  quickBar.style.cssText = 'padding:4px 8px;display:flex;gap:4px;flex-wrap:wrap;border-top:1px solid #060;';
  const quickQueries = [
    { label: 'Quests', query: 'quest_active(player, Q)' },
    { label: 'Inventory', query: 'has(player, X)' },
    { label: 'CEFR', query: 'player_cefr_level(player, L)' },
    { label: 'Vocab', query: 'pronunciation_count(player, C)' },
    { label: 'NPCs', query: 'person(X)' },
    { label: 'KB Stats', query: '__stats__' },
  ];
  for (const qq of quickQueries) {
    const btn = document.createElement('button');
    btn.textContent = qq.label;
    btn.style.cssText =
      'background:rgba(0,60,0,0.5);border:1px solid #060;color:#0f0;' +
      'font:11px monospace;padding:2px 6px;cursor:pointer;border-radius:3px;';
    btn.onclick = () => executeQuery(qq.query);
    quickBar.appendChild(btn);
  }
  prologPanel.appendChild(quickBar);

  // Input area
  const inputRow = document.createElement('div');
  inputRow.style.cssText = 'display:flex;border-top:1px solid #0f0;';

  const prompt = document.createElement('span');
  prompt.textContent = '?- ';
  prompt.style.cssText = 'padding:6px;color:#0f0;font:bold 13px monospace;';
  inputRow.appendChild(prompt);

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'person(X).';
  input.style.cssText =
    'flex:1;background:transparent;border:none;color:#0f0;' +
    'font:13px monospace;outline:none;padding:6px 0;';
  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      executeQuery(input.value.trim());
      input.value = '';
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (_historyIndex < _queryHistory.length - 1) {
        _historyIndex++;
        input.value = _queryHistory[_queryHistory.length - 1 - _historyIndex];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (_historyIndex > 0) {
        _historyIndex--;
        input.value = _queryHistory[_queryHistory.length - 1 - _historyIndex];
      } else {
        _historyIndex = -1;
        input.value = '';
      }
    }
  };
  inputRow.appendChild(input);
  prologPanel.appendChild(inputRow);
  _inputEl = input;

  body.appendChild(prologPanel);

  // ── LLM Tab Panel ────────────────────────────────────────────────────────
  const llmPanel = createEntryTabPanel('llm', 'No LLM events yet. Chat with an NPC to see prompt/response summaries here.');
  body.appendChild(llmPanel);

  // ── Language Tab Panel ───────────────────────────────────────────────────
  const langPanel = createEntryTabPanel('language', 'No language events yet. Complete a conversation to see EVAL scores, grammar feedback, and vocabulary tracking here.');
  body.appendChild(langPanel);

  _tabPanels = { prolog: prologPanel, llm: llmPanel, language: langPanel };

  panel.appendChild(body);
  container.appendChild(panel);
  _panelDiv = panel;
  _activeTab = 'prolog';
}

/**
 * Create a placeholder tab panel with a "no events" message.
 */
function createPlaceholderTab(tab: DebugTab, message: string): HTMLDivElement {
  const tabPanel = document.createElement('div');
  tabPanel.dataset.tabPanel = tab;
  tabPanel.style.cssText = 'display:none;flex-direction:column;flex:1;overflow:hidden;';

  const content = document.createElement('pre');
  content.dataset.scroll = 'true';
  content.style.cssText =
    'flex:1;overflow-y:auto;padding:8px;margin:0;font:12px monospace;' +
    'color:#0f0;max-height:280px;white-space:pre-wrap;word-break:break-all;';
  content.textContent = `% ${message}\n`;
  tabPanel.appendChild(content);

  return tabPanel;
}

/**
 * Create a tab panel with an entry container for collapsible log entries.
 * Shows a placeholder message when empty; entries are added via addDebugLogEntry().
 */
function createEntryTabPanel(tab: DebugTab, placeholderMessage: string): HTMLDivElement {
  const tabPanel = document.createElement('div');
  tabPanel.dataset.tabPanel = tab;
  tabPanel.style.cssText = 'display:none;flex-direction:column;flex:1;overflow:hidden;';

  // Placeholder shown when no entries exist
  const placeholder = document.createElement('pre');
  placeholder.dataset.placeholder = 'true';
  placeholder.style.cssText =
    'padding:8px;margin:0;font:12px monospace;color:#060;' +
    'white-space:pre-wrap;word-break:break-all;';
  placeholder.textContent = `% ${placeholderMessage}\n`;
  tabPanel.appendChild(placeholder);

  // Scrollable entry container
  const entryContainer = createEntryContainer(tab);
  tabPanel.appendChild(entryContainer);

  return tabPanel;
}

/**
 * Hide the Prolog debug panel.
 */
export function hidePrologDebugPanel(): void {
  if (_panelDiv) _panelDiv.style.display = 'none';
}

/**
 * Remove the Prolog debug panel entirely.
 */
export function disposePrologDebugPanel(): void {
  if (_panelDiv) {
    _panelDiv.remove();
    _panelDiv = null;
    _inputEl = null;
    _outputEl = null;
    _prologEngine = null;
    _tabBtns = null;
    _tabPanels = null;
    _titleLabel = null;
    _activeTab = 'prolog';
    _scrollPositions.prolog = 0;
    _scrollPositions.llm = 0;
    _scrollPositions.language = 0;
    disposeEntryStores();
    if (_busUnsubscribe) {
      _busUnsubscribe();
      _busUnsubscribe = null;
    }
  }
}

/**
 * Execute a Prolog query and display the results in the panel.
 */
async function executeQuery(queryText: string): Promise<void> {
  if (!_prologEngine || !_outputEl) return;
  if (!queryText) return;

  // Record in history
  _queryHistory.push(queryText);
  _historyIndex = -1;

  // Special commands
  if (queryText === '__stats__') {
    const stats = _prologEngine.getStats();
    appendOutput(`\n?- [KB Stats]\nFacts: ${stats?.factCount ?? '?'}\nRules: ${stats?.ruleCount ?? '?'}\n`);
    return;
  }

  // Strip trailing period if present
  const goal = queryText.endsWith('.') ? queryText.slice(0, -1) : queryText;

  appendOutput(`\n?- ${goal}.`);

  try {
    const results = await _prologEngine.query(goal);
    if (!results || results.length === 0) {
      appendOutput('false.');
    } else {
      for (const result of results) {
        const bindings = Object.entries(result);
        if (bindings.length === 0) {
          appendOutput('true.');
        } else {
          const formatted = bindings.map(([k, v]) => `${k} = ${v}`).join(', ');
          appendOutput(formatted);
        }
      }
    }
  } catch (err: any) {
    appendOutput(`ERROR: ${err?.message || err}`);
  }
}

function appendOutput(text: string): void {
  if (!_outputEl) return;
  _outputEl.textContent += text + '\n';
  _outputEl.scrollTop = _outputEl.scrollHeight;
}

// ── Utils ────────────────────────────────────────────────────────────────────

function sanitize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^([0-9])/, '_$1').replace(/_+/g, '_');
}
