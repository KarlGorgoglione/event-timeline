import { useDemo } from '../../app/context';
import { PRESETS, type ThemePreset } from '../../themes/presets';
import { Card } from '../shared/Card';

/** A miniature timeline in the preset's own colours. */
export function ThemePreview({ preset }: { preset: ThemePreset }) {
  const t = preset.theme;
  const [a, b, c] = preset.palette.series;
  const lanes = [
    { y: 22, color: t.element.lineColor },
    { y: 36, color: t.element.lineColor },
    { y: 50, color: t.element.lineColor },
  ];
  return (
    <svg viewBox="0 0 120 62" className="preview" aria-hidden="true">
      <rect width="120" height="62" fill={t.background} />
      <rect width="120" height="12" fill={t.background} />
      <line x1="0" y1="12" x2="120" y2="12" stroke={t.grid.color} />
      {[30, 70, 110].map((x) => (
        <line
          key={x}
          x1={x}
          y1="12"
          x2={x}
          y2="62"
          stroke={t.grid.color}
          strokeDasharray={t.grid.dash.join(' ') || undefined}
        />
      ))}
      {[10, 50, 90].map((x) => (
        <rect
          key={x}
          x={x}
          y="4.5"
          width="14"
          height="3"
          rx="1.5"
          fill={t.header.textColor}
          opacity="0.7"
        />
      ))}
      {lanes.map((l, i) => (
        <g key={l.y}>
          <rect
            x="4"
            y={l.y - 2}
            width="14"
            height="3"
            rx="1.5"
            fill={t.element.labelColor}
            opacity="0.8"
          />
          <line
            x1={22 + i * 6}
            y1={l.y}
            x2="116"
            y2={l.y}
            stroke={l.color}
            strokeWidth={Math.min(3, t.element.lineWidth)}
            strokeLinecap="round"
          />
        </g>
      ))}
      <g strokeWidth="1.3">
        <circle cx="46" cy="22" r="2" fill={a} />
        <line x1="46" y1="22" x2="46" y2="46" stroke={a} />
        <path d="M43 45.5h6l-3 4z" fill={a} />
        <circle cx="78" cy="50" r="2" fill={b} />
        <line x1="78" y1="50" x2="78" y2="40" stroke={b} />
        <path d="M75 40.5h6l-3-4z" fill={b} />
      </g>
      <rect
        x="84"
        y="25"
        width="22"
        height="8"
        rx="2"
        fill={t.event.labelBoxBackground}
        stroke={t.event.labelBoxBorderColor}
        strokeWidth={t.event.labelBoxBorderWidth}
      />
      <rect
        x="87"
        y="28"
        width="16"
        height="2"
        rx="1"
        fill={t.event.labelColor}
        opacity="0.8"
      />
      <circle cx="100" cy="50" r="3.5" fill={t.cluster.color} />
      <line x1="58" y1="36" x2="58" y2="50" stroke={c} strokeWidth="1.3" />
      <circle
        cx="58"
        cy="36"
        r="2.8"
        fill="none"
        stroke={t.emphasis.selectionColor}
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function ThemeGallery() {
  const { state, dispatch } = useDemo();
  return (
    <Card title="Themes" eyebrow="Seven presets, one engine">
      <div className="gallery" role="radiogroup" aria-label="Theme preset">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={p.id === state.preset}
            className="gallery__item"
            title={p.blurb}
            onClick={() => dispatch({ type: 'preset', id: p.id })}
          >
            <ThemePreview preset={p} />
            <span className="gallery__name">{p.name}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}
