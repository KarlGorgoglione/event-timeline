// Shelf packer for the text atlas (§4, §16).
//
// Classic shelf packing: rows ("shelves") of fixed height are opened top to
// bottom; entries are placed left to right on the first shelf whose height
// fits without excessive waste. Glyph runs in a frame share a handful of font
// sizes, so shelf reuse is high and the simple first-fit heuristic is enough.

export interface ShelfAllocation {
  x: number;
  y: number;
}

interface Shelf {
  y: number;
  height: number;
  /** Next free x on this shelf. */
  x: number;
}

export class ShelfPacker {
  private shelves: Shelf[] = [];
  private nextY = 0;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  /** Reserve a w×h rectangle; null when the atlas is full. */
  allocate(w: number, h: number): ShelfAllocation | null {
    if (w <= 0 || h <= 0 || w > this.width) return null;
    // First fit among shelves tall enough but not wastefully taller (>25%).
    for (const shelf of this.shelves) {
      if (h <= shelf.height && h * 4 >= shelf.height * 3) {
        if (shelf.x + w <= this.width) {
          const slot = { x: shelf.x, y: shelf.y };
          shelf.x += w;
          return slot;
        }
      }
    }
    if (this.nextY + h > this.height) return null;
    const shelf: Shelf = { y: this.nextY, height: h, x: w };
    this.shelves.push(shelf);
    this.nextY += h;
    return { x: 0, y: shelf.y };
  }

  reset(): void {
    this.shelves = [];
    this.nextY = 0;
  }
}
