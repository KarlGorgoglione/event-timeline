import { describe, expect, it } from 'vitest';
import { ShelfPacker } from './shelfPack';

describe('ShelfPacker (§4 text atlas)', () => {
  it('packs same-height entries left to right on one shelf', () => {
    const packer = new ShelfPacker(100, 100);
    expect(packer.allocate(30, 10)).toEqual({ x: 0, y: 0 });
    expect(packer.allocate(30, 10)).toEqual({ x: 30, y: 0 });
    expect(packer.allocate(30, 10)).toEqual({ x: 60, y: 0 });
  });

  it('opens a new shelf when the row is full', () => {
    const packer = new ShelfPacker(100, 100);
    packer.allocate(60, 10);
    packer.allocate(60, 10); // 60 + 60 > 100 → new shelf
    expect(packer.allocate(10, 10)).toEqual({ x: 60, y: 0 }); // first shelf still has room
  });

  it('opens a new shelf for a clearly taller entry', () => {
    const packer = new ShelfPacker(100, 100);
    packer.allocate(10, 10);
    expect(packer.allocate(10, 30)).toEqual({ x: 0, y: 10 });
  });

  it('reuses a slightly taller shelf (within 25% waste)', () => {
    const packer = new ShelfPacker(100, 100);
    packer.allocate(10, 16);
    expect(packer.allocate(10, 14)).toEqual({ x: 10, y: 0 });
  });

  it('never overlaps and stays in bounds', () => {
    const packer = new ShelfPacker(64, 64);
    const rects: { x: number; y: number; w: number; h: number }[] = [];
    const sizes = [12, 20, 8, 16, 12, 24, 10];
    for (let i = 0; i < 60; i++) {
      const w = (sizes[i % sizes.length] as number) + (i % 3);
      const h = (sizes[(i + 2) % sizes.length] as number) % 18 || 8;
      const slot = packer.allocate(w, h);
      if (slot === null) continue;
      expect(slot.x + w).toBeLessThanOrEqual(64);
      expect(slot.y + h).toBeLessThanOrEqual(64);
      for (const r of rects) {
        const overlaps =
          slot.x < r.x + r.w &&
          r.x < slot.x + w &&
          slot.y < r.y + r.h &&
          r.y < slot.y + h;
        expect(overlaps).toBe(false);
      }
      rects.push({ x: slot.x, y: slot.y, w, h });
    }
    expect(rects.length).toBeGreaterThan(0);
  });

  it('returns null when full, and packs again after reset', () => {
    const packer = new ShelfPacker(20, 20);
    expect(packer.allocate(20, 20)).toEqual({ x: 0, y: 0 });
    expect(packer.allocate(1, 1)).toBeNull();
    packer.reset();
    expect(packer.allocate(20, 20)).toEqual({ x: 0, y: 0 });
  });

  it('rejects degenerate and oversized requests', () => {
    const packer = new ShelfPacker(20, 20);
    expect(packer.allocate(0, 5)).toBeNull();
    expect(packer.allocate(5, 0)).toBeNull();
    expect(packer.allocate(21, 5)).toBeNull();
  });
});
