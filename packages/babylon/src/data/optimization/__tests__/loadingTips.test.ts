import { describe, it, expect } from 'vitest';
import { LOADING_TIPS, pickTip } from '../loadingTips';

describe('loadingTips', () => {
  it('ships a non-empty default tip list', () => {
    expect(LOADING_TIPS.length).toBeGreaterThan(0);
  });

  it('pickTip cycles through tips deterministically', () => {
    const tips = ['a', 'b', 'c'];
    expect(pickTip(tips, 0)).toBe('a');
    expect(pickTip(tips, 1)).toBe('b');
    expect(pickTip(tips, 2)).toBe('c');
    expect(pickTip(tips, 3)).toBe('a');
  });

  it('pickTip handles negative indices', () => {
    const tips = ['a', 'b', 'c'];
    expect(pickTip(tips, -1)).toBe('c');
    expect(pickTip(tips, -4)).toBe('c');
  });

  it('pickTip returns empty string when no tips', () => {
    expect(pickTip([], 0)).toBe('');
  });
});
