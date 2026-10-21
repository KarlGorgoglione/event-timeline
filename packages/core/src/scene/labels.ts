// Label collision culling (DESIGN.md §4, §6).
//
// Labels are placed greedily in priority order against a coarse occupancy
// grid over the viewport: a label whose box overlaps an occupied cell is
// skipped, so dense views stay readable instead of overprinting, and a
// per-frame cap bounds the text work (and the WebGL text atlas) however many
// labels are eligible.

/** Occupancy cell size in CSS px. */
const CELL_PX = 6;

export class LabelPlacer {
  private cols = 0;
  private rows = 0;
  private cells = new Uint8Array(0);
  private placed = 0;
  private cap = Infinity;

  /** Start a frame over a `width` × `height` CSS-px viewport. */
  reset(width: number, height: number, cap: number): void {
    this.cols = Math.max(1, Math.ceil(width / CELL_PX));
    this.rows = Math.max(1, Math.ceil(height / CELL_PX));
    const size = this.cols * this.rows;
    if (this.cells.length < size) this.cells = new Uint8Array(size);
    else this.cells.fill(0, 0, size);
    this.placed = 0;
    this.cap = cap;
  }

  get count(): number {
    return this.placed;
  }

  /**
   * Mark a box as taken without counting it against the cap: element labels
   * and icons, which always draw and which event labels must avoid.
   */
  reserve(x: number, y: number, w: number, h: number): void {
    this.mark(x, y, w, h);
  }

  /**
   * Place a label box if the cap allows and it overlaps nothing placed so
   * far. Boxes entirely off-screen never count against the cap.
   */
  tryPlace(x: number, y: number, w: number, h: number): boolean {
    if (this.placed >= this.cap) return false;
    const range = this.range(x, y, w, h);
    if (range === null) return false;
    const [c0, c1, r0, r1] = range;
    for (let r = r0; r <= r1; r++) {
      const row = r * this.cols;
      for (let c = c0; c <= c1; c++) {
        if (this.cells[row + c] === 1) return false;
      }
    }
    this.fill(c0, c1, r0, r1);
    this.placed++;
    return true;
  }

  /** Place a label if the cap allows, ignoring overlaps. */
  placeAnyway(x: number, y: number, w: number, h: number): boolean {
    if (this.placed >= this.cap) return false;
    this.mark(x, y, w, h);
    this.placed++;
    return true;
  }

  private mark(x: number, y: number, w: number, h: number): void {
    const range = this.range(x, y, w, h);
    if (range !== null) this.fill(...range);
  }

  private fill(c0: number, c1: number, r0: number, r1: number): void {
    for (let r = r0; r <= r1; r++) {
      this.cells.fill(1, r * this.cols + c0, r * this.cols + c1 + 1);
    }
  }

  /** Clamped cell range of a box, or null when it lies outside the viewport. */
  private range(
    x: number,
    y: number,
    w: number,
    h: number,
  ): [number, number, number, number] | null {
    const c0 = Math.max(0, Math.floor(x / CELL_PX));
    const c1 = Math.min(this.cols - 1, Math.floor((x + w) / CELL_PX));
    const r0 = Math.max(0, Math.floor(y / CELL_PX));
    const r1 = Math.min(this.rows - 1, Math.floor((y + h) / CELL_PX));
    if (c0 > c1 || r0 > r1) return null;
    return [c0, c1, r0, r1];
  }
}
