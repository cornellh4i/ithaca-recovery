import { createCache } from "../../util/common/simpleCache";

// Deferred helper: lets a test hold a promise open and resolve/reject it on
// its own schedule, to reproduce the specific interleaving the race depends on.
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createCache", () => {
  it("returns the same in-flight promise for concurrent callers of the same key", () => {
    const cache = createCache<string>();
    const first = deferred<string>();
    const fetcher = jest.fn(() => first.promise);

    const a = cache.getOrFetch("key", fetcher);
    const b = cache.getOrFetch("key", fetcher);

    expect(a).toBe(b);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("re-fetches after a rejection", async () => {
    const cache = createCache<string>();
    const failing = deferred<string>();
    const failingPromise = cache.getOrFetch("key", () => failing.promise);
    failing.reject(new Error("boom"));
    await expect(failingPromise).rejects.toThrow("boom");

    const succeeding = cache.getOrFetch("key", () => Promise.resolve("fresh"));
    await expect(succeeding).resolves.toBe("fresh");
  });

  // Regression for #338: an invalidate() + re-fetch mid-flight swaps in a newer promise
  // under the same key. If the older promise's own rejection handler unconditionally
  // deleted the cache entry by key, it would evict the newer (possibly healthy) entry
  // instead of the stale one it was actually attached to.
  it("does not evict a newer entry when an older, invalidated promise later rejects", async () => {
    const cache = createCache<string>();
    const stale = deferred<string>();

    const stalePromise = cache.getOrFetch("key", () => stale.promise);
    cache.invalidate("key");

    const fresh = deferred<string>();
    const freshPromise = cache.getOrFetch("key", () => fresh.promise);

    // The stale fetch settles (rejects) only after the fresh one has already taken its slot.
    stale.reject(new Error("stale request failed"));
    await expect(stalePromise).rejects.toThrow("stale request failed");

    // The fresh entry must still be the one served for this key -- not evicted by the stale
    // promise's rejection handler. A distinct fetcher proves this: if the fresh entry had been
    // evicted, getOrFetch would fall through to calling it (a cache miss).
    const afterRejectionFetcher = jest.fn(() => Promise.resolve("should not be called"));
    expect(cache.getOrFetch("key", afterRejectionFetcher)).toBe(freshPromise);
    expect(afterRejectionFetcher).not.toHaveBeenCalled();

    fresh.resolve("fresh value");
    await expect(freshPromise).resolves.toBe("fresh value");
  });

  it("still evicts on rejection when it's the current entry for that key", async () => {
    const cache = createCache<string>();
    const failing = deferred<string>();
    const failingPromise = cache.getOrFetch("key", () => failing.promise);
    failing.reject(new Error("boom"));
    await expect(failingPromise).rejects.toThrow("boom");

    // A later getOrFetch for the same key must trigger a brand-new fetcher call, proving
    // the failed entry was actually deleted rather than left dangling.
    const refetcher = jest.fn(() => Promise.resolve("second try"));
    await expect(cache.getOrFetch("key", refetcher)).resolves.toBe("second try");
    expect(refetcher).toHaveBeenCalledTimes(1);
  });
});
