import { AssetMount, DEFAULT_ASSET_MOUNTS } from './asset-mount';

/**
 * Resolves relative asset paths against a set of configured mounts.
 *
 * Usage:
 *   AssetResolver.setGlobal(new AssetResolver(userMounts));
 *   const url = AssetResolver.global().resolve('assets/models/tree.glb');
 *   // → "https://storage.googleapis.com/insimul/assets/models/tree.glb"
 *
 * Integrates with Babylon.js via Tools.PreprocessUrl so every asset load
 * (SceneLoader, Texture, Sound) is automatically resolved.
 */
export class AssetResolver {
  private mounts: AssetMount[];
  private static instance: AssetResolver | null = null;

  constructor(mounts?: AssetMount[] | null) {
    this.mounts = (mounts && mounts.length > 0 ? mounts : DEFAULT_ASSET_MOUNTS)
      .slice()
      .sort((a, b) => a.priority - b.priority);
  }

  /** Resolve a relative asset path to a full URL. */
  resolve(relativePath: string): string {
    // Already absolute — pass through
    if (
      relativePath.startsWith('http://') ||
      relativePath.startsWith('https://') ||
      relativePath.startsWith('blob:') ||
      relativePath.startsWith('data:')
    ) {
      return relativePath;
    }

    // Strip leading slash or ./ for consistent matching
    const clean = relativePath.replace(/^\.?\//, '');

    for (const mount of this.mounts) {
      if (clean.startsWith(mount.prefix)) {
        return mount.baseUrl + clean;
      }
    }

    // No mount matched — return with leading slash (local dev fallback)
    return '/' + clean;
  }

  /** Split a resolved URL into [rootUrl, fileName] for BabylonJS SceneLoader. */
  splitForSceneLoader(resolvedUrl: string): [string, string] {
    const lastSlash = resolvedUrl.lastIndexOf('/');
    if (lastSlash >= 0) {
      return [
        resolvedUrl.substring(0, lastSlash + 1),
        resolvedUrl.substring(lastSlash + 1),
      ];
    }
    return ['./', resolvedUrl];
  }

  /** Get the configured mounts (read-only). */
  getMounts(): readonly AssetMount[] {
    return this.mounts;
  }

  /** Set the global singleton instance. */
  static setGlobal(resolver: AssetResolver): void {
    AssetResolver.instance = resolver;
  }

  /** Get the global singleton (creates a default if none set). */
  static global(): AssetResolver {
    if (!AssetResolver.instance) {
      AssetResolver.instance = new AssetResolver();
    }
    return AssetResolver.instance;
  }
}
