// Diagnostics sink contract + default sink (DESIGN.md §1 validation policy).
//
// Validation is lenient: invalid items are dropped, never thrown, and reported
// through an injectable sink so the core stays decoupled from any logging
// implementation and the behaviour is unit-testable.

/** Why something was dropped, ignored or degraded. */
export type DiagnosticCode =
  /** An event's `time` (or `endTime`) is not a finite number. */
  | 'invalid-time'
  /** An event references an element id that isn't in the dataset. */
  | 'dangling-edge'
  /** A second element or event reused an id; the later one is dropped. */
  | 'duplicate-id'
  /** An id is missing, empty or not a string. */
  | 'invalid-id'
  /** An optional field has the wrong type and was ignored. */
  | 'invalid-field'
  /** A font is not sized in `px`; the default font was used instead. */
  | 'invalid-font'
  /** A layout strategy returned unknown, duplicate or missing ids. */
  | 'invalid-layout'
  /** An icon image failed to load, decode or upload. */
  | 'icon-failed'
  /** A draw call threw; the frame was finished without it. */
  | 'render-error'
  /** The preferred renderer was unavailable and another one is used. */
  | 'renderer-fallback';

export type DiagnosticSubject =
  | 'element'
  | 'event'
  | 'theme'
  | 'layout'
  | 'icon'
  | 'renderer';

export interface Diagnostic {
  code: DiagnosticCode;
  kind: DiagnosticSubject;
  /** Id of the offending item, when known. */
  id?: string;
  reason: string;
}

export type OnDiagnostic = (d: Diagnostic) => void;

/**
 * Whether this is a production build. `process.env.NODE_ENV` is written
 * literally so bundlers (Vite, webpack, esbuild) replace it statically; where
 * nothing replaces it and no `process` exists (a plain browser), the access
 * throws and we treat the build as development.
 */
function isProduction(): boolean {
  try {
    return process.env.NODE_ENV === 'production';
  } catch {
    return false;
  }
}

/** How many example reasons a summary line quotes. */
const SUMMARY_EXAMPLES = 3;

/**
 * The default sink: a no-op in production; in development it collects the
 * diagnostics reported during one task (one `setData` call, one streaming
 * batch, one frame) and logs a single `console.warn` summary on the next
 * microtask, instead of one line per dropped item.
 */
export function createDefaultDiagnosticSink(): OnDiagnostic {
  if (isProduction()) return () => {};
  let pending: Diagnostic[] = [];
  const flush = (): void => {
    const batch = pending;
    pending = [];
    console.warn(formatSummary(batch));
  };
  return (d) => {
    if (pending.length === 0) queueMicrotask(flush);
    pending.push(d);
  };
}

/** One human-readable line summarising a batch of diagnostics. */
export function formatSummary(batch: readonly Diagnostic[]): string {
  const byCode = new Map<DiagnosticCode, number>();
  for (const d of batch) byCode.set(d.code, (byCode.get(d.code) ?? 0) + 1);
  const counts = [...byCode].map(([code, n]) => `${n} ${code}`).join(', ');
  const examples = batch
    .slice(0, SUMMARY_EXAMPLES)
    .map((d) => `${d.kind}${d.id !== undefined ? ` ${d.id}` : ''}: ${d.reason}`)
    .join('; ');
  const more = batch.length > SUMMARY_EXAMPLES ? '; …' : '';
  return `[timeline] ${batch.length} diagnostic(s) (${counts}). ${examples}${more}`;
}
