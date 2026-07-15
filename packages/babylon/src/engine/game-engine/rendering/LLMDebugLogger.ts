/**
 * LLMDebugLogger — Logs LLM prompt/response summaries to the debug console LLM tab.
 *
 * Each chat exchange creates one collapsible DebugLogEntry with:
 * - Collapsed: NPC name, response preview, token estimate, latency
 * - Expanded: System prompt summary, full user message, full response, parsed markers, latency breakdown
 *
 * All events are gated behind isDebugLabelsEnabled() for zero overhead when debug is off.
 */

import { isDebugLabelsEnabled } from './DebugLabelUtils';
import { getDebugEventBus } from '../debug-event-bus';

// ── Types ───────────────────────────────────────────────────────────────────

export interface LLMChatExchangeData {
  /** NPC display name */
  npcName: string;
  /** Full system prompt text */
  systemPrompt: string;
  /** Full user message text */
  userMessage: string;
  /** Full LLM response text (before marker stripping) */
  fullResponse: string;
  /** Time in ms from request start to first streamed chunk */
  timeToFirstChunk: number;
  /** Total time in ms for the full response */
  totalTimeMs: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Rough token estimate: chars / 4 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Summarise a prompt: first 80 chars + ... + last 40 chars */
function summarizeText(text: string, headLen = 80, tailLen = 40): string {
  if (text.length <= headLen + tailLen + 10) return text;
  return text.slice(0, headLen) + '...' + text.slice(-tailLen);
}

/** Truncate to a max length with ellipsis */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

/** Detect known directive markers in the system prompt */
function detectDirectives(systemPrompt: string): string[] {
  const directives: string[] = [];

  // Language mode
  const modeMatch = systemPrompt.match(/language mode:\s*(simplified|bilingual|natural)/i);
  if (modeMatch) directives.push(`mode: ${modeMatch[1]}`);

  // CEFR level
  const cefrMatch = systemPrompt.match(/CEFR[:\s]+([A-C][12])/i);
  if (cefrMatch) directives.push(`CEFR: ${cefrMatch[1]}`);

  // Frequency constraint
  const freqMatch = systemPrompt.match(/words ranked (\d+-\d+)/i);
  if (freqMatch) directives.push(`freq: ${freqMatch[1]}`);

  // Scaffolding
  if (systemPrompt.includes('SCAFFOLDING')) directives.push('scaffolding');

  // Quest offering
  if (systemPrompt.includes('QUEST OFFERING')) directives.push('quest-offering');

  return directives;
}

/** Detect parsed marker blocks in the raw LLM response */
function detectResponseMarkers(response: string): string[] {
  const markers: string[] = [];
  if (/\*\*GRAMMAR_FEEDBACK\*\*/.test(response)) markers.push('GRAMMAR_FEEDBACK');
  if (/\*\*QUEST_ASSIGN\*\*/.test(response)) markers.push('QUEST_ASSIGN');
  if (/\*\*QUEST_BRANCH\*\*/.test(response)) markers.push('QUEST_BRANCH');
  if (/\*\*VOCAB_HINTS\*\*/.test(response)) markers.push('VOCAB_HINTS');
  if (/\*\*EVAL\*\*/.test(response)) markers.push('EVAL');
  return markers;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Log a complete chat exchange to the LLM debug tab.
 * Call after the full response is received and before marker stripping.
 */
export function logLLMChatExchange(data: LLMChatExchangeData): void {
  if (!isDebugLabelsEnabled()) return;

  const responseTokens = estimateTokens(data.fullResponse);
  const promptTokens = estimateTokens(data.systemPrompt);
  const totalTime = (data.totalTimeMs / 1000).toFixed(1);
  const ttfc = (data.timeToFirstChunk / 1000).toFixed(1);
  const markers = detectResponseMarkers(data.fullResponse);
  const directives = detectDirectives(data.systemPrompt);
  const responsePreview = truncate(
    data.fullResponse.replace(/\*\*\w+\*\*[\s\S]*?\*\*END_\w+\*\*/g, '').trim(),
    60,
  );

  // ── Collapsed summary ──
  const summary = `[Chat] ${data.npcName}: "${responsePreview}" (est. ${responseTokens} tok, ${totalTime}s)`;

  // ── Expanded detail ──
  const promptSummary = summarizeText(data.systemPrompt);
  const directiveLine = directives.length > 0 ? directives.join(', ') : 'none detected';
  const markerLine = markers.length > 0 ? markers.join(', ') : 'none';

  const detail = [
    `── System Prompt (est. ${promptTokens} tok) ──`,
    promptSummary,
    `Directives: ${directiveLine}`,
    '',
    `── User Message ──`,
    data.userMessage,
    '',
    `── Response (est. ${responseTokens} tok) ──`,
    summarizeText(data.fullResponse, 200, 100),
    '',
    `Parsed markers: ${markerLine}`,
    `Latency: TTFC ${ttfc}s, total ${totalTime}s`,
  ].join('\n');

  getDebugEventBus().emit({
    timestamp: Date.now(),
    category: 'llm',
    level: 'info',
    tag: 'LLM',
    summary,
    detail,
    source: 'client',
  });

  // ── Unabridged console.debug ──
  console.debug('[LLMDebug] chat exchange:', {
    npc: data.npcName,
    systemPrompt: data.systemPrompt,
    userMessage: data.userMessage,
    fullResponse: data.fullResponse,
    tokens: { prompt: promptTokens, response: responseTokens },
    markers,
    directives,
    latency: { ttfcMs: data.timeToFirstChunk, totalMs: data.totalTimeMs },
  });
}

/**
 * Log an LLM error to the LLM debug tab.
 */
export function logLLMError(npcName: string, userMessage: string, error: string): void {
  if (!isDebugLabelsEnabled()) return;

  getDebugEventBus().emit({
    timestamp: Date.now(),
    category: 'llm',
    level: 'error',
    tag: 'LLM',
    summary: `[Error] ${npcName}: ${truncate(error, 60)}`,
    detail: `NPC: ${npcName}\nUser message: ${userMessage}\nError: ${error}`,
    source: 'client',
  });

  console.debug('[LLMDebug] error:', { npc: npcName, userMessage, error });
}
