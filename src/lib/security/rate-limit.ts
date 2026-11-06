export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Sliding-window rate limiter held in memory.
 *
 * Best effort only: on serverless hosting each instance has its own memory, so this slows
 * down bursts of guessing on one instance but is not a global limit. Supabase Auth applies
 * its own server-side limits to sign-in and sign-up as the real backstop.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  check(key: string): RateLimitResult {
    const now = this.now();
    const windowStart = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > windowStart);

    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      const oldest = recent[0]!;
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000)),
      };
    }

    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) this.sweep(windowStart);
    return { allowed: true, remaining: this.limit - recent.length, retryAfterSeconds: 0 };
  }

  private sweep(windowStart: number) {
    for (const [key, times] of this.hits) {
      if (times.every((t) => t <= windowStart)) this.hits.delete(key);
    }
  }
}
