// Generic "check cache, else fetch" helper, extracted from DailyView/WeeklyView's
// duplicated Map + check/fetch/store boilerplate. Only the caching mechanics are shared —
// each view still owns its own fetch/transform (their data shapes differ too much to merge).

export interface SimpleCache<T> {
    getOrFetch: (key: string, fetcher: () => Promise<T>) => Promise<T>;
    invalidate: (key: string) => void;
    clear: () => void;
}

export function createCache<T>(): SimpleCache<T> {
    const cache = new Map<string, T>();

    const getOrFetch = async (key: string, fetcher: () => Promise<T>): Promise<T> => {
        if (cache.has(key)) {
            console.log("Using cached data for key:", key);
            return cache.get(key) as T;
        }
        const value = await fetcher();
        cache.set(key, value);
        return value;
    };

    const invalidate = (key: string) => {
        console.log("Invalidating cache for key:", key);
        cache.delete(key);
    };

    const clear = () => cache.clear();

    return { getOrFetch, invalidate, clear };
}
