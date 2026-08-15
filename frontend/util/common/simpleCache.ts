// Generic "check cache, else fetch" helper, extracted from DayView/WeekView's
// duplicated Map + check/fetch/store boilerplate. Only the caching mechanics are shared —
// each view still owns its own fetch/transform (their data shapes differ too much to merge).

export interface SimpleCache<T> {
    getOrFetch: (key: string, fetcher: () => Promise<T>) => Promise<T>;
    invalidate: (key: string) => void;
    clear: () => void;
}

export function createCache<T>(): SimpleCache<T> {
    // Caches the in-flight promise, not just the resolved value -- React Strict Mode's
    // dev-only double effect invocation means two callers can ask for the same key before
    // either resolves, and without this they'd fire two independent requests that race.
    const cache = new Map<string, Promise<T>>();

    const getOrFetch = (key: string, fetcher: () => Promise<T>): Promise<T> => {
        if (!cache.has(key)) {
            const promise = fetcher();
            // Compare-and-delete: a stale invalidate()+refetch can swap in a newer promise
            // under this key before this one settles, so an unconditional delete on rejection
            // would evict the newer (possibly healthy) entry instead of this one.
            promise.catch(() => {
                if (cache.get(key) === promise) cache.delete(key);
            });
            cache.set(key, promise);
        }
        return cache.get(key) as Promise<T>;
    };

    const invalidate = (key: string) => {
        console.log("Invalidating cache for key:", key);
        cache.delete(key);
    };

    const clear = () => cache.clear();

    return { getOrFetch, invalidate, clear };
}
