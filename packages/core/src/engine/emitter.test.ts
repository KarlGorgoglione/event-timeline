import { describe, expect, it, vi } from 'vitest';
import { TypedEmitter, type TimelineEventMap } from './emitter';

describe('TypedEmitter', () => {
  it('delivers an emitted payload to listeners', () => {
    const emitter = new TypedEmitter<TimelineEventMap>();
    const fn = vi.fn();
    emitter.on('dataChange', fn);
    const counts = {
      elements: { added: 3, removed: 0, updated: 0 },
      events: { added: 0, removed: 0, updated: 0 },
    };
    emitter.emit('dataChange', counts);
    expect(fn).toHaveBeenCalledWith(counts);
  });

  it('stops delivery after unsubscribe', () => {
    const emitter = new TypedEmitter<TimelineEventMap>();
    const fn = vi.fn();
    const unsubscribe = emitter.on('ready', fn);
    emitter.emit('ready', undefined);
    unsubscribe();
    emitter.emit('ready', undefined);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('off removes a specific listener', () => {
    const emitter = new TypedEmitter<TimelineEventMap>();
    const a = vi.fn();
    const b = vi.fn();
    emitter.on('ready', a);
    emitter.on('ready', b);
    emitter.off('ready', a);
    emitter.emit('ready', undefined);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('clear drops all listeners', () => {
    const emitter = new TypedEmitter<TimelineEventMap>();
    const fn = vi.fn();
    emitter.on('ready', fn);
    emitter.clear();
    emitter.emit('ready', undefined);
    expect(fn).not.toHaveBeenCalled();
  });
});
