import { describe, it, expect } from 'vitest';
import { QuickResumeCache, memoryQuickResumeStorage } from '../QuickResumeCache';

describe('QuickResumeCache', () => {
  it('returns false when no entry exists', () => {
    const cache = new QuickResumeCache({ storage: memoryQuickResumeStorage() });
    expect(cache.canQuickResume('save1', 'v1')).toBe(false);
  });

  it('returns true for matching version within freshness window', () => {
    const cache = new QuickResumeCache({ storage: memoryQuickResumeStorage() });
    const t0 = 1_700_000_000_000;
    cache.record('save1', 'v1', t0);
    expect(cache.canQuickResume('save1', 'v1', t0 + 1000)).toBe(true);
  });

  it('invalidates on version mismatch', () => {
    const cache = new QuickResumeCache({ storage: memoryQuickResumeStorage() });
    cache.record('save1', 'v1', 1_700_000_000_000);
    expect(cache.canQuickResume('save1', 'v2', 1_700_000_001_000)).toBe(false);
  });

  it('invalidates entries older than maxAgeMs', () => {
    const cache = new QuickResumeCache({
      storage: memoryQuickResumeStorage(),
      maxAgeMs: 1000,
    });
    const t0 = 1_700_000_000_000;
    cache.record('save1', 'v1', t0);
    expect(cache.canQuickResume('save1', 'v1', t0 + 2000)).toBe(false);
  });

  it('clear() removes entries', () => {
    const cache = new QuickResumeCache({ storage: memoryQuickResumeStorage() });
    cache.record('save1', 'v1');
    cache.clear('save1');
    expect(cache.get('save1')).toBeNull();
  });

  it('tolerates corrupted JSON in storage', () => {
    const storage = memoryQuickResumeStorage();
    storage.set('insimul.quickResume:bad', '{not json');
    const cache = new QuickResumeCache({ storage });
    expect(cache.get('bad')).toBeNull();
  });
});
