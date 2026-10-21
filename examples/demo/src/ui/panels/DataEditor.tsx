// Playground: edit TimelineData as JSON and apply it with setData. Bad items
// are dropped and reported through onDiagnostic (§1), listed below.

import { useState } from 'react';
import { useDemo } from '../../app/context';
import { BROKEN_JSON, SAMPLE_JSON } from '../../scenarios/playground';
import type { DemoData } from '../../scenarios/types';
import { Card } from '../shared/Card';
import { DiagnosticsList } from '../advanced/DiagnosticsList';

export function DataEditor() {
  const { replaceData, handle } = useDemo();
  const [text, setText] = useState(SAMPLE_JSON);
  const [error, setError] = useState<string | null>(null);

  const apply = (json: string) => {
    try {
      const parsed = JSON.parse(json) as Partial<DemoData>;
      if (!Array.isArray(parsed.elements) || !Array.isArray(parsed.events)) {
        throw new Error('Expected { "elements": [...], "events": [...] }');
      }
      setError(null);
      replaceData({ elements: parsed.elements, events: parsed.events });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const load = (json: string) => {
    setText(json);
    apply(json);
  };

  return (
    <Card title="Your data" eyebrow="setData · getData · onDiagnostic">
      <textarea
        className="input code-editor"
        spellCheck={false}
        value={text}
        aria-label="Timeline data as JSON"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) apply(text);
        }}
      />
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="btn-row">
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={() => apply(text)}
          title="Ctrl/⌘ + Enter"
        >
          Apply
        </button>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => load(SAMPLE_JSON)}
        >
          Sample
        </button>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => load(BROKEN_JSON)}
        >
          Broken sample
        </button>
        <button
          type="button"
          className="btn btn--sm"
          title="getData(): what the timeline holds now"
          onClick={() => {
            const data = handle.current?.getData();
            if (data) setText(JSON.stringify(data, null, 2));
          }}
        >
          Export
        </button>
      </div>
      <h3 className="subhead">Diagnostics</h3>
      <DiagnosticsList empty="No diagnostics: every item was valid." />
    </Card>
  );
}
