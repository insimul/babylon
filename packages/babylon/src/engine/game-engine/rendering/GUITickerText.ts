/**
 * GUITickerText — Reusable hover-to-scroll ticker for Babylon.js GUI text.
 *
 * When text is wider than its container, hovering scrolls it left like a
 * marquee/ticker to reveal the full content. Leaving resets it.
 *
 * Usage:
 *   import { createTickerText, disposeAllTickers, disposeTickers } from './GUITickerText';
 *
 *   // Create a ticker text block (returns a Rectangle clip container)
 *   const clip = createTickerText({
 *     id: 'myText',
 *     text: 'Some very long text that might be clipped',
 *     color: '#E0E0E0',
 *     fontSize: 9,
 *     containerWidth: 150,
 *     height: 16,
 *   });
 *   parent.addControl(clip);
 *
 *   // Clean up when rebuilding (stops animations, returns handles for disposal)
 *   disposeTickers(myTickerHandles);
 */

import {
  Control,
  Rectangle,
  TextBlock,
} from '@babylonjs/gui';

// ── Configuration ───────────────────────────────────────────────────────────

const TICKER_SPEED = 40;       // pixels per second
const TICKER_CHAR_WIDTH = 5.4; // approximate px per char at fontSize 9
const TICKER_FPS = 30;

// ── Types ───────────────────────────────────────────────────────────────────

export interface TickerHandle {
  animId: ReturnType<typeof setInterval> | null;
  textBlock: TextBlock;
  container: Rectangle;
  maxScroll: number;
}

export interface TickerTextOptions {
  /** Unique element ID */
  id: string;
  /** Display text */
  text: string;
  /** Text color */
  color: string;
  /** Font size in pixels */
  fontSize: number;
  /** Available container width in pixels */
  containerWidth: number;
  /** Height in pixels */
  height: number;
  /** Italic text */
  italic?: boolean;
  /** Bold text */
  bold?: boolean;
  /** Custom char-width multiplier (default: TICKER_CHAR_WIDTH scaled by fontSize/9) */
  charWidth?: number;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Create a text block inside a clipping container. If the text is wider
 * than the container, hovering scrolls it left like a ticker/marquee;
 * leaving resets it.
 *
 * Returns the clip Rectangle (add to parent) and a TickerHandle (track for cleanup).
 * If text fits, no animation is set up and handle.animId stays null.
 */
export function createTickerText(
  opts: TickerTextOptions,
  /** Optional array — if provided, the handle is pushed onto it automatically. */
  handles?: TickerHandle[],
): Rectangle {
  const {
    id, text, color, fontSize, containerWidth, height,
    italic, bold, charWidth,
  } = opts;

  // Clip container — Rectangle clips children by default
  const clip = new Rectangle(`${id}_clip`);
  clip.width = `${containerWidth}px`;
  clip.height = `${height}px`;
  clip.thickness = 0;
  clip.background = 'transparent';

  // Estimate text width
  const cw = charWidth ?? TICKER_CHAR_WIDTH * (fontSize / 9);
  const estimatedTextWidth = text.length * cw;
  const textWidth = Math.max(containerWidth, estimatedTextWidth);

  const tb = new TextBlock(id);
  tb.text = text;
  tb.color = color;
  tb.fontSize = fontSize;
  if (italic) tb.fontStyle = 'italic';
  if (bold) tb.fontWeight = 'bold';
  tb.width = `${textWidth}px`;
  tb.height = `${height}px`;
  tb.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  tb.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  tb.left = '0px';
  clip.addControl(tb);

  // Only set up ticker if text overflows
  const overflow = estimatedTextWidth - containerWidth;
  const handle: TickerHandle = {
    animId: null,
    textBlock: tb,
    container: clip,
    maxScroll: overflow + 12,
  };

  if (overflow > 2) {
    clip.isPointerBlocker = true;
    clip.onPointerEnterObservable.add(() => { startTicker(handle); });
    clip.onPointerOutObservable.add(() => { resetTicker(handle); });
  }

  if (handles) handles.push(handle);
  return clip;
}

/**
 * Stop all ticker animations and clear the handle array.
 */
export function disposeTickers(handles: TickerHandle[]): void {
  for (const h of handles) stopTicker(h);
  handles.length = 0;
}

// ── Internal ────────────────────────────────────────────────────────────────

function startTicker(h: TickerHandle): void {
  if (h.animId) return;
  const intervalMs = Math.round(1000 / TICKER_FPS);
  const step = TICKER_SPEED * (intervalMs / 1000);
  let offset = 0;

  h.animId = setInterval(() => {
    offset += step;
    if (offset >= h.maxScroll) {
      h.textBlock.left = `${-h.maxScroll}px`;
      stopTicker(h);
      return;
    }
    h.textBlock.left = `${-offset}px`;
  }, intervalMs);
}

function resetTicker(h: TickerHandle): void {
  stopTicker(h);
  h.textBlock.left = '0px';
}

function stopTicker(h: TickerHandle): void {
  if (h.animId) {
    clearInterval(h.animId);
    h.animId = null;
  }
}
