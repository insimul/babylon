/**
 * Asset mount configuration — maps path prefixes to base URLs.
 * Stored per-user in the database so each user can configure
 * their own asset sources (GCS, S3, external drives, etc.).
 */
export interface AssetMount {
  /** Path prefix to match, e.g. "assets/models/" or "assets/" */
  prefix: string;
  /** Base URL to prepend, e.g. "https://storage.googleapis.com/insimul/" */
  baseUrl: string;
  /** Priority (lower = higher priority). First matching prefix wins. */
  priority: number;
}

/** Default GCS bucket — used when a user has no custom mounts configured. */
const DEFAULT_GCS_BASE = 'https://storage.googleapis.com/insimul/';

/**
 * Build the system default mount list.
 * Honors the ASSET_BASE_URL env var if set (for dev overrides).
 */
export function getDefaultAssetMounts(): AssetMount[] {
  const baseUrl =
    (typeof process !== 'undefined' && process.env?.ASSET_BASE_URL) ||
    DEFAULT_GCS_BASE;
  return [{ prefix: 'assets/', baseUrl, priority: 0 }];
}

export const DEFAULT_ASSET_MOUNTS: AssetMount[] = [
  { prefix: 'assets/', baseUrl: DEFAULT_GCS_BASE, priority: 0 },
];
