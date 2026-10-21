import { useMemo, useState } from 'react';
import { useDemo } from '../../app/context';
import { editCount } from '../../app/state';
import { urlFromState } from '../../app/urlState';
import { reactSnippet, themeJson } from '../../schema/codegen';
import { Card } from '../shared/Card';
import { Check, Copy, Link, Reset } from '../icons';

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn--sm"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? <Check size={13} /> : <Copy size={13} />}{' '}
      {done ? 'Copied' : label}
    </button>
  );
}

export function ExportPanel() {
  const { theme, options, state, dispatch } = useDemo();
  const snippet = useMemo(() => reactSnippet(theme, options), [theme, options]);
  const json = useMemo(() => themeJson(theme), [theme]);
  const link = `${location.origin}${location.pathname}${urlFromState(state)}`;
  const changes = editCount(state);
  return (
    <>
      <Card
        title="React"
        eyebrow="What you see, as a component"
        actions={<CopyButton text={snippet} label="Copy" />}
      >
        <pre className="code">
          <code>{snippet}</code>
        </pre>
      </Card>
      <Card
        title="Theme"
        eyebrow="ThemeInput: only what differs from defaultTheme"
        actions={<CopyButton text={json} label="Copy" />}
      >
        <pre className="code code--short">
          <code>{json}</code>
        </pre>
      </Card>
      <Card title="Share" eyebrow="Scenario, theme and every edit, in a link">
        <div className="share">
          <Link size={14} />
          <input
            className="input input--mono share__url"
            readOnly
            value={link}
            aria-label="Share link"
            onFocus={(e) => e.currentTarget.select()}
          />
          <CopyButton text={link} label="Copy link" />
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={changes === 0}
          onClick={() => dispatch({ type: 'resetAll' })}
        >
          <Reset size={13} /> Reset all {changes > 0 ? `(${changes})` : ''}
        </button>
      </Card>
    </>
  );
}
