/**
 * Idle shutdown (SPEC §9.2): an open page sends a heartbeat every minute, and any API
 * request counts as activity. After `idleMs` with no activity, `onIdle` runs once.
 */
export class IdleWatcher {
  private lastActivity: number;
  private timer: NodeJS.Timeout | null = null;
  private fired = false;

  constructor(
    private readonly idleMs: number,
    private readonly onIdle: () => void,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.lastActivity = now();
  }

  /** Records activity. */
  touch(): void {
    this.lastActivity = this.now();
  }

  /** True once `idleMs` has passed without activity. Calls `onIdle` the first time. */
  check(): boolean {
    if (this.idleMs <= 0 || this.fired) return this.fired;
    if (this.now() - this.lastActivity >= this.idleMs) {
      this.fired = true;
      this.onIdle();
    }
    return this.fired;
  }

  /** Checks every `everyMs` (default: once a minute). The timer never keeps Node alive. */
  start(everyMs = 60_000): void {
    if (this.idleMs <= 0 || this.timer) return;
    this.timer = setInterval(() => this.check(), everyMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
