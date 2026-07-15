/**
 * Canonical visual/audio asset types
 *
 * `VisualAsset` (and its siblings) describe a generated or authored media asset
 * — an image, texture, 3D model, or audio clip — referenced by the runtime's
 * rendering layer (BabylonGame, TextureManager, AudioManager) and the
 * IDataSource abstraction. Hosting the type here lets both runtime and authoring
 * (the platform's Drizzle schema) reference the same shape without a
 * runtime → platform back-reference.
 *
 * The shape mirrors the platform's `visual_assets` table row
 * (`typeof visualAssets.$inferSelect`). The platform's `shared/schema.ts`
 * re-exports this type so existing
 * `import type { VisualAsset } from '@shared/schema'` paths continue to resolve.
 * Keep the two in sync: nullability here matches the table's column definitions
 * (non-`.notNull()` columns are `T | null` on select).
 */

/** A generated or authored media asset (image, texture, model, or audio clip). */
export interface VisualAsset {
  id: string;
  /** Nullable for base/reusable assets not scoped to a single world. */
  worldId: string | null;

  // Asset identification
  name: string;
  description: string | null;
  /** e.g. character_portrait, building_exterior, ground_texture, audio, model. */
  assetType: string;

  // File information
  /** Relative path from public/assets. */
  filePath: string;
  fileName: string;
  /** In bytes. */
  fileSize: number | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;

  // Generation metadata
  generationProvider: string | null;
  generationPrompt: string | null;
  generationParams: Record<string, any> | null;

  // Versioning and variants
  parentAssetId: string | null;
  version: number | null;
  /** IDs of variant assets. */
  variants: string[] | null;

  // Usage and purpose
  purpose: string | null;
  usageContext: string | null;
  tags: string[] | null;

  // Status and availability
  status: string | null;

  // Error tracking (for failed generations)
  errorMessage: string | null;

  // Metadata
  metadata: Record<string, any> | null;

  createdAt: Date | null;
  updatedAt: Date | null;
}
