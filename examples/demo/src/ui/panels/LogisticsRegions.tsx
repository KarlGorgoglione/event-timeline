import { useDemo } from '../../app/context';
import { REGIONS, UNOPENED_PORT } from '../../scenarios/data/logistics';
import { slotColor } from '../../scenarios/common';
import { Card } from '../shared/Card';

/** Region shortcuts: `scrollToElement` brings a region's first port into view. */
export function LogisticsRegions() {
  const { handle, preset } = useDemo();
  return (
    <Card title="Regions" eyebrow="explicit layout · scrollToElement">
      <div className="chips">
        {REGIONS.map((r, i) => (
          <button
            key={r.id}
            type="button"
            className="chip chip--swatch"
            style={{ ['--chip' as string]: slotColor(preset, i + 1) }}
            onClick={() => {
              const ports = r.ports.map(([code]) => `port-${code}`);
              handle.current?.scrollToElement(ports[0]!);
              handle.current?.select({ elements: ports });
            }}
          >
            {r.name}
          </button>
        ))}
        <button
          type="button"
          className="chip"
          onClick={() => {
            handle.current?.scrollToElement(UNOPENED_PORT);
            handle.current?.select({ elements: [UNOPENED_PORT] });
          }}
        >
          The empty row
        </button>
      </div>
    </Card>
  );
}
