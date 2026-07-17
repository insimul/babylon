/**
 * Save / load slot view-model (US-GU3).
 *
 * The engine-agnostic heart of the save/load slot UI. A save slot is loaded by the
 * codec (C++ `insimul_save_codec` on Godot, the platform on Babylon) into an OUTCOME
 * — empty, ok (with a summary), or one of the envelope validation failures. This
 * model turns those outcomes into a display row (status + title + user message +
 * load/save affordances), so the integrity-failure MESSAGING is a shared,
 * cross-engine contract rather than per-UI copy.
 *
 * The Godot `save_slot_model.gd` mirrors this; the shared cases live in
 * `packages/core/conformance/ui/save-slot-cases.json`. `classifyEnvelope` is a
 * TS-only convenience that runs the real `validateSaveFileEnvelope` (SHA-256
 * integrity) and maps its verdict to an outcome — so the TS suite proves the whole
 * corrupted-envelope chain end-to-end while both legs share the outcome→view matrix.
 */

import { validateSaveFileEnvelope } from '../save-envelope';

/** A slot load verdict, mirroring the envelope validator's error codes (+ empty/ok). */
export type SlotOutcome =
  | 'empty'
  | 'ok'
  | 'invalid_format'
  | 'missing_save_file'
  | 'integrity_mismatch';

/** Present-only summary shown on a healthy slot. */
export interface SlotSummary {
  readonly playerName?: string;
  readonly level?: number;
  readonly locationName?: string;
  readonly gold?: number;
  readonly savedAt?: string;
}

/** What the codec reports for one slot index. */
export interface SlotLoadResult {
  readonly index: number;
  readonly outcome: SlotOutcome;
  readonly summary?: SlotSummary;
}

export type SlotStatus = 'empty' | 'ok' | 'corrupted';

/** A rendered slot row the panel binds to. */
export interface SlotView {
  readonly index: number;
  readonly status: SlotStatus;
  readonly title: string;
  readonly message: string;
  readonly canLoad: boolean;
  readonly canSave: boolean;
  readonly summary?: SlotSummary;
}

/** Human, cross-engine messaging for each non-ok outcome. */
export const SLOT_MESSAGES: Readonly<Record<SlotOutcome, string>> = {
  empty: '',
  ok: '',
  invalid_format: 'Unrecognized save format — this slot cannot be loaded.',
  missing_save_file: 'Save data is missing or unreadable.',
  integrity_mismatch: 'Save file integrity check failed — file may be corrupted or tampered.',
};

function summaryTitle(index: number, s?: SlotSummary): string {
  if (!s) return `Slot ${index + 1}`;
  const bits: string[] = [];
  if (s.playerName) bits.push(s.playerName);
  if (s.level !== undefined) bits.push(`Lv ${s.level}`);
  if (s.locationName) bits.push(s.locationName);
  return bits.length ? bits.join(' · ') : `Slot ${index + 1}`;
}

function view(result: SlotLoadResult): SlotView {
  const { index, outcome, summary } = result;
  if (outcome === 'empty') {
    return { index, status: 'empty', title: 'Empty Slot', message: '', canLoad: false, canSave: true };
  }
  if (outcome === 'ok') {
    return {
      index,
      status: 'ok',
      title: summaryTitle(index, summary),
      message: summary?.savedAt ? `Saved ${summary.savedAt}` : '',
      canLoad: true,
      canSave: true,
      summary,
    };
  }
  // Any validation failure -> corrupted. Cannot load, but can overwrite.
  return {
    index,
    status: 'corrupted',
    title: 'Corrupted Save',
    message: SLOT_MESSAGES[outcome],
    canLoad: false,
    canSave: true,
  };
}

export class SaveSlotModel {
  private results: SlotLoadResult[] = [];

  constructor(results: readonly SlotLoadResult[] = []) {
    this.results = results.map((r) => ({ ...r }));
  }

  setSlots(results: readonly SlotLoadResult[]): void {
    this.results = results.map((r) => ({ ...r }));
  }

  /** The rendered rows, in slot-index order. */
  slots(): SlotView[] {
    return [...this.results].sort((a, b) => a.index - b.index).map(view);
  }

  slot(index: number): SlotView | undefined {
    const r = this.results.find((x) => x.index === index);
    return r ? view(r) : undefined;
  }

  /** True when no slot is loadable (fresh install / all corrupted) — main-menu Continue gate. */
  hasAnyLoadable(): boolean {
    return this.results.some((r) => r.outcome === 'ok');
  }

  /**
   * TS-only: run the real envelope validator over a loaded slot candidate and map
   * its verdict to a `SlotLoadResult`. `null`/`undefined` candidate = empty slot.
   */
  static classifyEnvelope(
    index: number,
    candidate: unknown,
    summarize?: (candidate: unknown) => SlotSummary | undefined,
  ): SlotLoadResult {
    if (candidate === null || candidate === undefined) {
      return { index, outcome: 'empty' };
    }
    const res = validateSaveFileEnvelope(candidate);
    if (res.ok) {
      return { index, outcome: 'ok', summary: summarize?.(candidate) };
    }
    return { index, outcome: res.error.code };
  }
}
