import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultDiagnosticSink, formatSummary } from './diagnostics';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('default diagnostic sink (§1)', () => {
  it('logs one summary per task instead of one line per item', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sink = createDefaultDiagnosticSink();
    for (let i = 0; i < 50; i++) {
      sink({ code: 'dangling-edge', kind: 'event', id: `e${i}`, reason: 'x' });
    }
    sink({ code: 'duplicate-id', kind: 'element', id: 'a', reason: 'dup' });
    expect(warn).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('51 diagnostic(s)');
    expect(warn.mock.calls[0]?.[0]).toContain(
      '50 dangling-edge, 1 duplicate-id',
    );
  });

  it('is silent in production builds', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sink = createDefaultDiagnosticSink();
    sink({ code: 'invalid-time', kind: 'event', reason: 'x' });
    await Promise.resolve();
    expect(warn).not.toHaveBeenCalled();
  });

  it('quotes a few examples in the summary', () => {
    const line = formatSummary([
      { code: 'invalid-id', kind: 'event', reason: 'bad id' },
      { code: 'invalid-time', kind: 'event', id: 'e2', reason: 'bad time' },
    ]);
    expect(line).toContain('event: bad id');
    expect(line).toContain('event e2: bad time');
  });
});
