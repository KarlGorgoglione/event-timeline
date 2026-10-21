// Three years of container shipments between 22 ports in five regions. Ports
// carry an explicit `order` (grouped by region) and one port has no traffic
// yet, so it exercises the `explicit` layout and `emptyElements: 'show'`.

import { mulberry32 } from '../../synthetic';
import type { DemoData, DemoElement, DemoEvent } from '../types';

const DAY = 86_400_000;
export const LOGISTICS_START = Date.UTC(2024, 0, 1);
export const LOGISTICS_END = Date.UTC(2027, 0, 1);

export interface Region {
  id: string;
  name: string;
  /** Share of shipments leaving the region. */
  weight: number;
  ports: ReadonlyArray<readonly [code: string, name: string, country: string]>;
}

export const REGIONS: readonly Region[] = [
  {
    id: 'asia',
    name: 'Asia',
    weight: 0.45,
    ports: [
      ['SHA', 'Shanghai', 'CN'],
      ['SIN', 'Singapore', 'SG'],
      ['PUS', 'Busan', 'KR'],
      ['SZX', 'Shenzhen', 'CN'],
      ['TYO', 'Tokyo', 'JP'],
    ],
  },
  {
    id: 'europe',
    name: 'Europe',
    weight: 0.2,
    ports: [
      ['RTM', 'Rotterdam', 'NL'],
      ['HAM', 'Hamburg', 'DE'],
      ['ANR', 'Antwerp', 'BE'],
      ['FXT', 'Felixstowe', 'GB'],
      ['VLC', 'Valencia', 'ES'],
    ],
  },
  {
    id: 'americas',
    name: 'Americas',
    weight: 0.2,
    ports: [
      ['LAX', 'Los Angeles', 'US'],
      ['NYC', 'New York', 'US'],
      ['SSZ', 'Santos', 'BR'],
      ['YVR', 'Vancouver', 'CA'],
      ['HOU', 'Houston', 'US'],
    ],
  },
  {
    id: 'mea',
    name: 'Middle East & Africa',
    weight: 0.1,
    ports: [
      ['DXB', 'Jebel Ali', 'AE'],
      ['PSD', 'Port Said', 'EG'],
      ['DUR', 'Durban', 'ZA'],
      ['TNG', 'Tanger Med', 'MA'],
    ],
  },
  {
    id: 'oceania',
    name: 'Oceania',
    weight: 0.05,
    ports: [
      ['SYD', 'Sydney', 'AU'],
      ['AKL', 'Auckland', 'NZ'],
      ['NOU', 'Nouméa', 'NC'],
    ],
  },
];

/** A port that opens in 2027: listed, but with no shipments yet. */
export const UNOPENED_PORT = 'port-NOU';

const CARGO = [
  'Electronics',
  'Machinery',
  'Textiles',
  'Automotive',
  'Pharma',
  'Food',
];

const thousands = (n: number) =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function makeLogistics(seed = 11, count = 620): DemoData {
  const rand = mulberry32(seed);
  const elements: DemoElement[] = REGIONS.flatMap((region, r) =>
    region.ports.map(([code, name, country], i) => ({
      id: `port-${code}`,
      label: name,
      order: r * 100 + i,
      data: { region: region.id, code, country, category: r + 1 },
    })),
  );
  const ports = (r: Region) =>
    r.ports
      .map(([code]) => `port-${code}`)
      .filter((id) => id !== UNOPENED_PORT);

  const pickRegion = (except?: Region): Region => {
    const pool = REGIONS.filter((r) => r !== except);
    const total = pool.reduce((s, r) => s + r.weight, 0);
    let x = rand() * total;
    for (const r of pool) if ((x -= r.weight) <= 0) return r;
    return pool[0] as Region;
  };
  const pickPort = (r: Region) => {
    const list = ports(r);
    return list[Math.floor(rand() * list.length)] as string;
  };

  const span = LOGISTICS_END - LOGISTICS_START;
  const events: DemoEvent[] = [];
  for (let i = 0; i < count; i++) {
    const from = pickRegion();
    const to = rand() < 0.8 ? pickRegion(from) : from;
    const sourceId = pickPort(from);
    let targetId = pickPort(to);
    if (targetId === sourceId) targetId = pickPort(to);
    if (targetId === sourceId) continue;

    // Peak season (Aug–Oct) carries about twice the traffic.
    let time = LOGISTICS_START + Math.floor(rand() * span);
    const month = new Date(time).getUTCMonth();
    if (month < 7 && rand() < 0.3) {
      const year = new Date(time).getUTCFullYear();
      time = Date.UTC(year, 7, 1) + Math.floor(rand() * 92 * DAY);
    }

    const railable =
      (from.id === 'asia' && to.id === 'europe') ||
      (from.id === 'europe' && to.id === 'asia');
    const roll = rand();
    const mode =
      roll < 0.18 ? 'air' : railable && roll < 0.4 ? 'rail' : ('sea' as const);
    const amount =
      mode === 'air'
        ? Math.round(4 + rand() * 60)
        : Math.round((mode === 'rail' ? 40 : 200) + rand() * 3800);
    events.push({
      id: `ship-${i}`,
      sourceId,
      targetId,
      time,
      label: mode === 'air' ? `${amount} t` : `${thousands(amount)} TEU`,
      data: {
        mode,
        amount,
        cargo: CARGO[Math.floor(rand() * CARGO.length)] as string,
        region: from.id,
        category: REGIONS.indexOf(from) + 1,
      },
    });
  }
  return { elements, events };
}
