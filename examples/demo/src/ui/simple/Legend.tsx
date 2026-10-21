import { useDemo } from '../../app/context';
import { Card } from '../shared/Card';
import type { LegendItem } from '../../scenarios/types';

/** A small drawing of each legend mark, in the mark's own colour. */
export function LegendMark({ item }: { item: LegendItem }) {
  const c = item.color;
  const w = 30;
  switch (item.mark) {
    case 'line':
      return (
        <svg width={w} height="12" aria-hidden="true">
          <line
            x1="1"
            y1="6"
            x2={w - 1}
            y2="6"
            stroke={c}
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'loop':
      return (
        <svg width={w} height="12" aria-hidden="true">
          <line
            x1="1"
            y1="10"
            x2={w - 1}
            y2="10"
            stroke={c}
            strokeOpacity="0.45"
            strokeWidth="2"
          />
          <path d="M11 10V3h8v6" fill="none" stroke={c} strokeWidth="1.5" />
          <path d="M16.5 7.5h5l-2.5 3z" fill={c} />
        </svg>
      );
    case 'cluster':
      return (
        <svg width={w} height="12" aria-hidden="true">
          <circle cx="7" cy="6" r="4.5" fill={c} />
          <text x="14" y="9.5" fontSize="9" fontWeight="700" fill={c}>
            ×N
          </text>
        </svg>
      );
    case 'hop':
      return (
        <svg width={w} height="12" aria-hidden="true">
          <line
            x1="1"
            y1="7"
            x2={w - 1}
            y2="7"
            stroke={c}
            strokeOpacity="0.5"
            strokeWidth="2"
          />
          <path
            d="M15 12V9.5a2.5 2.5 0 0 1 0-5V0"
            fill="none"
            stroke={c}
            strokeWidth="1.5"
          />
        </svg>
      );
    case 'icon':
      return <span className="legend__glyph">{item.glyph}</span>;
    default: {
      const dash =
        item.mark === 'dashed'
          ? '5 3'
          : item.mark === 'dotted'
            ? '1 3'
            : undefined;
      const width = item.mark === 'heavy' ? 2.5 : 1.5;
      return (
        <svg width={w} height="12" aria-hidden="true">
          <circle cx="3" cy="6" r="2.5" fill={c} />
          <line
            x1="4"
            y1="6"
            x2={w - 8}
            y2="6"
            stroke={c}
            strokeWidth={width}
            strokeDasharray={dash}
          />
          <path d={`M${w - 8} 2l6 4-6 4z`} fill={c} />
        </svg>
      );
    }
  }
}

export function Legend() {
  const { scenario, preset, hooks } = useDemo();
  const items = scenario.legend?.(preset);
  if (!items || items.length === 0) return null;
  return (
    <Card
      title="Legend"
      actions={
        !hooks.colours && (
          <span className="pill pill--muted">data colours off</span>
        )
      }
    >
      <ul className="legend">
        {items.map((item) => (
          <li key={item.label} className="legend__item">
            <LegendMark item={item} />
            <span className="legend__label">{item.label}</span>
            {item.detail !== undefined && (
              <span className="legend__detail">{item.detail}</span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
