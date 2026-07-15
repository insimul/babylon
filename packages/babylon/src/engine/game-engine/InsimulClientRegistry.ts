/**
 * Global registry for the InsimulClient instance.
 *
 * Allows game systems (SaveFileDataSource, ListeningComprehensionManager, etc.)
 * to access the SDK without needing constructor injection. BabylonGame sets the
 * instance after creating it.
 *
 * Usage:
 *   import { getInsimulClient } from '@shared/game-engine/InsimulClientRegistry';
 *   const client = getInsimulClient();
 *   if (client) { await client.synthesizeSpeech(text); }
 */

import type { InsimulClient } from '@insimul/typescript';

let _instance: InsimulClient | null = null;

/** Set the global InsimulClient instance (called by BabylonGame on startup). */
export function setInsimulClient(client: InsimulClient | null): void {
  _instance = client;
}

/** Get the global InsimulClient instance (null if not yet initialized). */
export function getInsimulClient(): InsimulClient | null {
  return _instance;
}
