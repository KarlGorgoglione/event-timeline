import { describe, expect, it } from 'vitest';
import { VERSION } from './index';

describe('@event-timeline/core', () => {
  it('exposes a version string', () => {
    expect(typeof VERSION).toBe('string');
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
