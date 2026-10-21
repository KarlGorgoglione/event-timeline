import { useDemo } from '../../app/context';
import { editCount } from '../../app/state';
import { DENSITIES, type Density } from '../../themes/density';
import { presetById } from '../../themes/presets';
import { Card } from '../shared/Card';
import { FieldRow, Segmented, Toggle } from '../controls';
import { Reset } from '../icons';

const ACCENTS = [
  '#38bdf8',
  '#a78bfa',
  '#f472b6',
  '#34d399',
  '#fbbf24',
  '#f97316',
];

const RENDERERS = [
  { value: 'auto', label: 'Auto' },
  { value: 'webgl', label: 'WebGL2' },
  { value: 'canvas2d', label: 'Canvas2D' },
];

/** The handful of knobs with the biggest visible effect. */
export function QuickControls() {
  const { state, dispatch, theme, options, hooks } = useDemo();
  const presetAccent = presetById(state.preset).theme.emphasis.selectionColor;
  const accents = [presetAccent, ...ACCENTS.filter((a) => a !== presetAccent)];
  const changes = editCount(state);

  return (
    <Card
      title="Quick controls"
      actions={
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={changes === 0}
          onClick={() => dispatch({ type: 'resetAll' })}
          title="Reset every edit"
        >
          <Reset size={13} /> Reset{changes > 0 ? ` (${changes})` : ''}
        </button>
      }
    >
      <div className="fields">
        <FieldRow
          label="Density"
          hint="Rescales rows, header and labels of any theme."
        >
          <Segmented
            label="Density"
            size="sm"
            value={state.density}
            options={DENSITIES}
            onChange={(d) =>
              dispatch({ type: 'density', density: d as Density })
            }
          />
        </FieldRow>
        <FieldRow
          label="Accent"
          hint="emphasis.selectionColor: the selection highlight (and this page's accent)."
        >
          <span
            className="swatches"
            role="radiogroup"
            aria-label="Accent colour"
          >
            {accents.map((c, i) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={theme.emphasis.selectionColor === c}
                aria-label={i === 0 ? `Theme default ${c}` : c}
                className="swatches__item"
                style={{ background: c }}
                onClick={() =>
                  dispatch({
                    type: 'theme',
                    path: 'emphasis.selectionColor',
                    value: c,
                  })
                }
              />
            ))}
          </span>
        </FieldRow>
        <FieldRow
          label="Data colours"
          hint="The scenario's style resolvers colour items from their payload."
        >
          <Toggle
            label="Data colours"
            value={hooks.colours}
            onChange={(v) =>
              dispatch({ type: 'hook', key: 'colours', value: v })
            }
          />
        </FieldRow>
        <FieldRow
          label="Clustering"
          hint="Merge nearby events into ×N markers."
        >
          <Toggle
            label="Clustering"
            value={options.clustering.enabled}
            onChange={(v) =>
              dispatch({ type: 'option', path: 'clustering.enabled', value: v })
            }
          />
        </FieldRow>
        <FieldRow
          label="Event labels"
          hint="A formatter returning undefined draws no label."
        >
          <Toggle
            label="Event labels"
            value={hooks.eventLabels}
            onChange={(v) =>
              dispatch({ type: 'hook', key: 'eventLabels', value: v })
            }
          />
        </FieldRow>
        <FieldRow
          label="Crossing hops"
          hint="Bridge arcs where an arrow crosses a line."
        >
          <Toggle
            label="Crossing hops"
            value={options.arrows.hops !== 'off'}
            onChange={(v) =>
              dispatch({
                type: 'option',
                path: 'arrows.hops',
                value: v ? 'auto' : 'off',
              })
            }
          />
        </FieldRow>
        <FieldRow label="Row separators" hint="theme.rowSeparator.enabled">
          <Toggle
            label="Row separators"
            value={theme.rowSeparator.enabled}
            onChange={(v) =>
              dispatch({
                type: 'theme',
                path: 'rowSeparator.enabled',
                value: v,
              })
            }
          />
        </FieldRow>
        <FieldRow label="Renderer" hint="Both renderers draw the same picture.">
          <Segmented
            label="Renderer"
            size="sm"
            value={options.renderer}
            options={RENDERERS}
            onChange={(v) =>
              dispatch({ type: 'option', path: 'renderer', value: v })
            }
          />
        </FieldRow>
      </div>
    </Card>
  );
}
