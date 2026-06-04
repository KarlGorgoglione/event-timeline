// Diagnostics sink contract + default sink (DESIGN.md §1 validation policy).
//
// Validation is lenient: invalid items are dropped, never thrown, and reported
// through an injectable sink so the core stays decoupled from any logging
// implementation (DIP) and the behaviour is unit-testable.

/** Why an item was dropped during ingest. */
export type DiagnosticCode = 'invalid-time' | 'dangling-edge' | 'duplicate-id';

export interface Diagnostic {
  code: DiagnosticCode;
  kind: 'element' | 'event';
  /** Id of the offending item, when known. */
  id?: string;
  reason: string;
}

export type OnDiagnostic = (d: Diagnostic) => void;

/**
 * The default sink: forwards to `console.warn` in development builds and is a
 * no-op in production (`process.env.NODE_ENV === 'production'`). `process` is
 * accessed guardedly so the core stays SSR/browser-safe.
 */
export function createDefaultDiagnosticSink(): OnDiagnostic {
  // Read NODE_ENV via globalThis so the core needs no Node type definitions and
  // stays safe in browser/SSR bundles that have no `process` global.
  const env = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env;
  if (env?.NODE_ENV === 'production') {
    return () => {};
  }
  return (d) => {
    const id = d.id !== undefined ? ` (${d.id})` : '';
    console.warn(`[timeline] dropped ${d.kind}${id}: ${d.reason}`);
  };
}
