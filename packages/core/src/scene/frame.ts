// Base-frame assembly (DESIGN.md §4, §5).
//
// Builds one frame from the camera, rows and data into reusable typed batches
// (device px) plus hit targets (CSS px), then plays the batches back
// bottom-to-top. Nothing is allocated per event in steady state.

import type { RowLayout } from '../layout/positions';
import type { Renderer } from '../render/types';
import { visibleRowBand } from './rowBand';
import type { FrameInput, RowBand } from './context';
import { buildElements } from './elements';
import { EventBuilder, placeLabels } from './events';
import { buildHeader, buildSeparators } from './header';
import { SceneOutput } from './output';

/** Frame inputs, minus what the builder derives itself (rows ↔ slots, band). */
export type FrameParams<TData> = Omit<
  FrameInput<TData>,
  'rowSlot' | 'slotRow' | 'band'
>;

export class FrameBuilder<TData> {
  readonly out = new SceneOutput();
  private readonly events = new EventBuilder<TData>();
  private rowSlot = new Int32Array(0);
  private slotRow = new Int32Array(0);
  private cachedRows: RowLayout | null = null;
  private cachedSlots = -1;

  /** The row band of the last frame. */
  band: RowBand = { firstRow: 0, lastRow: -1 };

  build(params: FrameParams<TData>): void {
    const { store, rows, camera, viewport, config } = params;
    this.mapRows(params);
    this.band = visibleRowBand(
      camera,
      viewport,
      rows.rowCount,
      config.metrics.headerHeight,
    );
    const input: FrameInput<TData> = {
      ...params,
      rowSlot: this.rowSlot,
      slotRow: this.slotRow,
      band: this.band,
    };
    const out = this.out;
    out.begin();
    out.targets.reset(store.eventCount, store.elementCount);
    out.labels.reset(
      viewport.cssWidth,
      viewport.cssHeight,
      config.labels.maxPerFrame,
    );
    buildHeader(input, out);
    buildSeparators(input, out);
    buildElements(input, out);
    this.events.build(input, out);
    placeLabels(input, out);
  }

  /** Forget measured widths (the renderer or the fonts changed). */
  clearMeasurements(): void {
    this.events.clearMeasurements();
  }

  draw(renderer: Renderer): void {
    this.out.draw(renderer);
  }

  /** Element slot → row and row → slot, recomputed when either side changes. */
  private mapRows(params: FrameParams<TData>): void {
    const { store, rows } = params;
    if (rows === this.cachedRows && store.slotsVersion === this.cachedSlots) {
      return;
    }
    this.cachedRows = rows;
    this.cachedSlots = store.slotsVersion;
    if (this.slotRow.length < store.elementCount) {
      this.slotRow = new Int32Array(store.elementCount);
    }
    this.slotRow.fill(-1);
    if (this.rowSlot.length < rows.rowCount) {
      this.rowSlot = new Int32Array(rows.rowCount);
    }
    for (let row = 0; row < rows.rowCount; row++) {
      const slot = store.slotOf(rows.orderedIds[row] as string) ?? -1;
      this.rowSlot[row] = slot;
      if (slot >= 0) this.slotRow[slot] = row;
    }
  }
}
