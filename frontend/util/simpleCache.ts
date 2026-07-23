// Generic "check cache, else fetch" helper, extracted from DailyView/WeeklyView's
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
            promise.catch(() => cache.delete(key));
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
