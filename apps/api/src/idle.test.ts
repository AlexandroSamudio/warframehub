import { describe, expect, it, vi } from 'vitest';
import { IdleWatcher } from './idle.js';

const MIN = 60_000;

describe('IdleWatcher', () => {
  it('fires once after the idle time with no activity', () => {
    let t = 0;
    const onIdle = vi.fn();
    const idle = new IdleWatcher(30 * MIN, onIdle, () => t);

    t = 30 * MIN - 1;
    expect(idle.check()).toBe(false);
    t = 30 * MIN;
    expect(idle.check()).toBe(true);
    idle.check();
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('activity (a heartbeat) pushes the deadline back', () => {
    let t = 0;
    const onIdle = vi.fn();
    const idle = new IdleWatcher(30 * MIN, onIdle, () => t);
    for (t = MIN; t <= 120 * MIN; t += MIN) {
      idle.touch(); // the page sends one heartbeat a minute
      idle.check();
    }
    expect(onIdle).not.toHaveBeenCalled();
    t += 30 * MIN;
    idle.check();
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('0 minutes means never', () => {
    let t = 0;
    const onIdle = vi.fn();
    const idle = new IdleWatcher(0, onIdle, () => t);
    t = 10_000 * MIN;
    expect(idle.check()).toBe(false);
    expect(onIdle).not.toHaveBeenCalled();
  });
});
