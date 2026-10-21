import { describe, expect, it } from 'vitest';
import { defaultTheme } from '../engine/theme';
import type { TimelineData, TimelineElement } from '../model/types';
import { RecordingRenderer } from '../testing/recordingRenderer';
import { points, segments, testFrame, texts } from '../testing/frame';
import { fitInsetLeft } from '../scale/camera';
import { markerContentWidth } from './elements';
import { TargetKind } from './targets';

// Default theme: row r centre = 58 + 34r; element lines are 2px (even, so no
// hairline offset). pxPerMs 1 from origin 0 puts time t at x = t.
const rowCenter = (row: number) => 58 + 34 * row;
const labelFont = defaultTheme.element.labelFont;

/** One element `a` whose line spans [min, max] (a self-event at each end). */
function line(
  min: number,
  max: number,
  element: Partial<TimelineElement> = {},
): TimelineData {
  return {
    elements: [{ id: 'a', label: 'A', ...element }],
    events: [
      { id: 's', sourceId: 'a', targetId: 'a', time: min },
      { id: 'e', sourceId: 'a', targetId: 'a', time: max },
    ],
  };
}

const elementLabels = (out: ReturnType<typeof testFrame>['out']) =>
  out.elementText.used
    .filter((b) => b.font === labelFont)
    .flatMap((b) => texts(b).map((t) => ({ ...t, align: b.align })));

describe('element start marker (§1)', () => {
  it('right-aligns the label just left of the line start when on-screen', () => {
    // line start 100 − lead 12 = 88; label right edge 88 − gap 8 = 80.
    const { out } = testFrame(line(100, 500));
    expect(elementLabels(out)).toEqual([
      { x: 80, y: rowCenter(0), text: 'A', align: 'right' },
    ]);
  });

  it('sticks the label to the left edge once the line start scrolls off', () => {
    const { out } = testFrame(line(-1000, 1000));
    expect(elementLabels(out)[0]).toMatchObject({
      x: defaultTheme.layout.edgePadding,
      align: 'left',
    });
  });

  it('culls the row when the line is off the left edge (end at 0 included)', () => {
    for (const max of [-1000, 0]) {
      const { out } = testFrame(line(-2000, max));
      expect(out.elementLines.used).toHaveLength(0);
      expect(elementLabels(out)).toHaveLength(0);
    }
  });

  it('clamps the drawn line and its hit target to the viewport', () => {
    const { out } = testFrame(line(-1_000_000, 1_000_000));
    const [seg] = segments(out.elementLines.used[0]!);
    expect(seg!.x1).toBeGreaterThan(-1000);
    expect(seg!.x2).toBeLessThan(2000);
    const t = out.targets.at(0);
    expect(t.kind).toBe(TargetKind.Element);
    expect(t.maxX).toBeLessThan(2000);
  });

  it('formats the label through the formatter', () => {
    const { out } = testFrame(line(100, 500, { label: 'Acme' }), {
      formatters: { elementLabel: (e) => (e.label ?? '').toUpperCase() },
    });
    expect(elementLabels(out)[0]!.text).toBe('ACME');
  });

  it('shows the id for an element without a string label', () => {
    const { out } = testFrame(line(100, 500, { label: undefined }));
    expect(elementLabels(out)[0]!.text).toBe('a');
  });

  it('applies resolver and per-element style, most specific winning (§11)', () => {
    const { out } = testFrame(
      line(100, 500, { style: { lineColor: '#0f0' } }),
      {
        styleResolvers: {
          element: () => ({ lineColor: '#f00', lineWidth: 5 }),
        },
      },
    );
    const b = out.elementLines.used[0]!;
    expect(b.color).toBe('#0f0');
    expect(b.width).toBe(5);
  });

  it('carries a line dash and honours theme spacing', () => {
    const { out } = testFrame(line(100, 500, { style: { lineDash: [4, 2] } }), {
      theme: { layout: { lineLead: 40 } },
    });
    expect(out.elementLines.used[0]!.dash).toEqual([4, 2]);
    expect(segments(out.elementLines.used[0]!)[0]!.x1).toBe(60);
  });
});

describe('element icons (§1, A-07)', () => {
  const iconSize = defaultTheme.element.iconSize;

  it('draws an image icon stacked over a centred label', () => {
    const image = {} as CanvasImageSource;
    const { out } = testFrame(line(100, 500, { icon: image }), {
      resolveIcon: { kind: 'image', image },
    });
    // marker centre = 88 − gap 8 − iconSize/2 = 72.
    expect(out.icons[0]).toMatchObject({
      x: 72 - iconSize / 2,
      size: iconSize,
      image,
    });
    expect(out.iconCount).toBe(1);
    expect(elementLabels(out)[0]).toMatchObject({ x: 72, align: 'center' });
  });

  it('draws an emoji icon as text', () => {
    const { out } = testFrame(line(100, 500, { icon: '🏦' }), {
      resolveIcon: { kind: 'text', text: '🏦' },
    });
    const glyph = out.elementText.used.find(
      (b) => b.font === `${iconSize}px sans-serif`,
    );
    expect(texts(glyph!)[0]!.text).toBe('🏦');
    expect(out.iconCount).toBe(0);
  });

  it('keeps the icon slot while a URL icon loads, so the label does not jump', () => {
    const { out } = testFrame(line(100, 500, { icon: 'https://x/i.png' }));
    expect(out.iconCount).toBe(0);
    expect(elementLabels(out)[0]!.x).toBe(72);
  });
});

describe('elements without events (§1, B-06)', () => {
  const data: TimelineData = {
    elements: [
      { id: 'a', label: 'A' },
      { id: 'idle', label: 'Idle' },
    ],
    events: [{ id: 's', sourceId: 'a', targetId: 'a', time: 100 }],
  };

  it("draws nothing for an event-less row under 'hide'", () => {
    const { out } = testFrame(data);
    expect(elementLabels(out).map((l) => l.text)).toEqual(['A']);
  });

  it("draws a label stub with a hit target under 'show'", () => {
    const { out } = testFrame(data, { emptyElements: 'show' });
    expect(elementLabels(out)).toContainEqual({
      x: defaultTheme.layout.edgePadding,
      y: rowCenter(1),
      text: 'Idle',
      align: 'left',
    });
    const kinds = Array.from({ length: out.targets.count }, (_, i) =>
      out.targets.at(i),
    );
    expect(
      kinds.some((t) => t.kind === TargetKind.Element && t.ref === 1),
    ).toBe(true);
  });
});

describe('fit inset from measured markers (§1, Q-08)', () => {
  it('reserves room for the widest marker at the data start', () => {
    const theme = defaultTheme;
    const fixed =
      theme.layout.edgePadding + theme.layout.markerGap + theme.layout.lineLead;
    expect(
      fitInsetLeft(fixed, [{ offsetMs: 0, contentWidth: 150 }], 1000, 1000),
    ).toBe(fixed + 150);
  });

  it('needs less room for lines that start later', () => {
    const narrow = fitInsetLeft(
      40,
      [{ offsetMs: 500, contentWidth: 150 }],
      1000,
      1000,
    );
    expect(narrow).toBe(0);
  });

  it('sizes marker content from the icon or the label, whichever is wider', () => {
    expect(markerContentWidth(40, 16, true)).toBe(40);
    expect(markerContentWidth(10, 16, true)).toBe(16);
    expect(markerContentWidth(10, 16, false)).toBe(10);
  });
});

describe('header and frame order (§4, §8)', () => {
  const data = line(Date.UTC(2026, 0, 1), Date.UTC(2026, 2, 1));
  const camera = {
    originTime: Date.UTC(2026, 0, 10),
    pxPerMs: 100 / 86_400_000,
  };

  it('pins the current period at the left edge (sticky label, B-10)', () => {
    const { out } = testFrame(data, { camera });
    const major = texts(out.majorText);
    expect(major).toEqual([{ text: 'Jan 2026', x: 4, y: expect.any(Number) }]);
  });

  it('pushes the sticky label out as the next period arrives', () => {
    // Feb 1 sits 20 px in: its label starts at 24, so "Jan 2026" (48 px wide
    // at 6 px/char) must end 12 px before it.
    const near = {
      originTime: Date.UTC(2026, 0, 31, 19, 12),
      pxPerMs: 100 / 86_400_000,
    };
    const { out } = testFrame(data, { camera: near });
    const [sticky] = texts(out.majorText);
    expect(sticky!.text).toBe('Jan 2026');
    expect(sticky!.x).toBe(Math.round(24 - 12 - 48));
  });

  it('draws content, then masks the header, then draws the ticks', () => {
    const { out } = testFrame(line(100, 500));
    const rec = new RecordingRenderer();
    out.draw(rec);
    const verbs = rec.calls.map((c) => c.verb);
    const mask = verbs.indexOf('fillRect');
    expect(verbs.indexOf('drawLines')).toBeLessThan(mask);
    expect(verbs.lastIndexOf('drawText')).toBeGreaterThan(mask);
    expect(rec.calls[0]).toEqual({
      verb: 'beginFrame',
      clearColor: defaultTheme.background,
    });
  });

  it('draws row separators only when enabled, centred in the row gap', () => {
    const off = testFrame(line(100, 500));
    expect(off.out.separators.count).toBe(0);
    const on = testFrame(line(100, 500), {
      theme: {
        rowSeparator: { enabled: true, color: '#333', width: 1, dash: [] },
      },
    });
    const [sep] = segments(on.out.separators);
    expect(sep!.y1).toBe(Math.round(44 + 28 + 3) + 0.5);
    expect(sep!.x2).toBe(800);
  });

  it('keeps the node buffer free of header geometry', () => {
    const { out } = testFrame(line(100, 500));
    expect(out.nodes.used.flatMap(points).every((p) => p.y > 44)).toBe(true);
  });
});
