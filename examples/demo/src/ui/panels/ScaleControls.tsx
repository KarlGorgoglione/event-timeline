import { useDemo } from '../../app/context';
import { useStore } from '../../app/store';
import { Card } from '../shared/Card';
import { useFrameSummary } from '../shared/FpsMeter';
import { FieldRow, NumberInput, Segmented, Select, Toggle } from '../controls';

const RENDERERS = [
  { value: 'webgl', label: 'WebGL2' },
  { value: 'canvas2d', label: 'Canvas2D' },
  { value: 'auto', label: 'Auto' },
];
const STRATEGIES = [
  { value: 'bySourceTargetColumn', label: 'Pair + pixel column' },
  { value: 'byElementPair', label: 'Element pair' },
  { value: 'byPixelColumn', label: 'Pixel column' },
  { value: 'byDay', label: 'Calendar day' },
];

export function ScaleControls() {
  const {
    scenario,
    variant,
    dispatch,
    options,
    backend,
    counts,
    scaleStream,
    setScaleStream,
    loading,
  } = useDemo();
  const frames = useFrameSummary();
  const { events } = useStore(counts);
  const fpsClass =
    frames.fps === 0
      ? ''
      : frames.fps >= 55
        ? 'stat__value--good'
        : frames.fps >= 30
          ? 'stat__value--warn'
          : 'stat__value--bad';
  return (
    <Card title="Scale" eyebrow="WebGL2 instancing · aggregation">
      <div className="fields">
        <FieldRow label="Dataset">
          <Segmented
            label="Dataset size"
            size="sm"
            value={variant ?? '10k'}
            options={(scenario.variants ?? []).map((v) => ({
              value: v.id,
              label: `${v.label} events`,
            }))}
            onChange={(id) => dispatch({ type: 'variant', id })}
          />
        </FieldRow>
      </div>
      <div className="stat-row">
        <div className="stat">
          <span className={`stat__value ${fpsClass}`}>
            {frames.fps === 0 ? 'idle' : frames.fps}
          </span>
          <span className="stat__label">fps (pan to measure)</span>
        </div>
        <div className="stat">
          <span className="stat__value">{frames.baseP50.toFixed(1)}</span>
          <span className="stat__label">ms base p50</span>
        </div>
        <div className="stat">
          <span className="stat__value">{frames.baseP95.toFixed(1)}</span>
          <span className="stat__label">ms base p95</span>
        </div>
        <div className="stat">
          <span className="stat__value">
            {loading ? '…' : (events / 1000).toFixed(events >= 10_000 ? 0 : 1)}k
          </span>
          <span className="stat__label">events</span>
        </div>
      </div>
      <div className="fields">
        <FieldRow
          label="Renderer"
          hint={`Drawing with ${backend}. The overlay is always Canvas2D.`}
        >
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
        <FieldRow label="Group by" hint="clustering.strategy">
          <Select
            label="Cluster strategy"
            value={options.clustering.strategy}
            options={STRATEGIES}
            onChange={(v) =>
              dispatch({
                type: 'option',
                path: 'clustering.strategy',
                value: v,
              })
            }
          />
        </FieldRow>
        <FieldRow label="Merge within" hint="clustering.minSeparationPx">
          <NumberInput
            label="Merge within"
            value={options.clustering.minSeparationPx}
            min={2}
            max={64}
            step={1}
            unit="px"
            onChange={(v) =>
              dispatch({
                type: 'option',
                path: 'clustering.minSeparationPx',
                value: v,
              })
            }
          />
        </FieldRow>
        <FieldRow
          label="Aggregate"
          hint="Far out, past the marker budget, read pre-binned per-pair counts."
        >
          <Toggle
            label="Aggregate"
            value={options.clustering.aggregate}
            onChange={(v) =>
              dispatch({
                type: 'option',
                path: 'clustering.aggregate',
                value: v,
              })
            }
          />
        </FieldRow>
        <FieldRow
          label="Marker budget"
          hint="clustering.maxMarkers"
          disabled={!options.clustering.aggregate}
        >
          <NumberInput
            label="Marker budget"
            value={options.clustering.maxMarkers}
            min={100}
            max={20000}
            step={100}
            onChange={(v) =>
              dispatch({
                type: 'option',
                path: 'clustering.maxMarkers',
                value: v,
              })
            }
          />
        </FieldRow>
        <FieldRow
          label="Stream +250/s"
          hint="addEvents into whatever is in view, capped at 5,000 extra."
        >
          <Toggle
            label="Stream extra events"
            value={scaleStream}
            onChange={setScaleStream}
          />
        </FieldRow>
      </div>
    </Card>
  );
}
