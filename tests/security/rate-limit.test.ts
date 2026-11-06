import { describe, expect, it } from "vitest";
import { RateLimiter } from "@/lib/security/rate-limit";

function clock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("RateLimiter", () => {
  it("allows up to the limit then blocks", () => {
    const c = clock();
    const limiter = new RateLimiter(3, 60_000, c.now);
    expect(limiter.check("k").remaining).toBe(2);
    expect(limiter.check("k").remaining).toBe(1);
    expect(limiter.check("k").remaining).toBe(0);
    expect(limiter.check("k").allowed).toBe(false);
  });

  it("reports how long to wait", () => {
    const c = clock();
    const limiter = new RateLimiter(1, 60_000, c.now);
    limiter.check("k");
    c.advance(20_000);
    expect(limiter.check("k")).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 40 });
  });

  it("lets requests through again once the window has passed", () => {
    const c = clock();
    const limiter = new RateLimiter(1, 60_000, c.now);
    limiter.check("k");
    expect(limiter.check("k").allowed).toBe(false);
    c.advance(60_001);
    expect(limiter.check("k").allowed).toBe(true);
  });

  it("keeps separate counts per key", () => {
    const limiter = new RateLimiter(1, 60_000, clock().now);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("b").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
  });

  it("does not count blocked attempts against the window", () => {
    const c = clock();
    const limiter = new RateLimiter(2, 60_000, c.now);
    limiter.check("k");
    limiter.check("k");
    c.advance(30_000);
    for (let i = 0; i < 10; i++) limiter.check("k"); // hammering while blocked
    c.advance(30_001); // the first two hits have now expired
    expect(limiter.check("k").allowed).toBe(true);
  });
});
