import { useDemo } from '../../app/context';
import { useStore } from '../../app/store';

export function DiagnosticsList({ empty }: { empty: string }) {
  const { diagnostics } = useDemo();
  const list = useStore(diagnostics);
  if (list.length === 0) return <p className="muted">{empty}</p>;
  return (
    <ul className="diagnostics">
      {list.map((d, i) => (
        <li key={i} className="diagnostics__item">
          <code className="diagnostics__code">{d.code}</code>
          <span className="diagnostics__subject">
            {d.kind}
            {d.id !== undefined && d.id !== '' ? ` ${d.id}` : ''}
          </span>
          <span className="diagnostics__reason">{d.reason}</span>
        </li>
      ))}
    </ul>
  );
}
