// Next.js's real "server-only" package unconditionally throws — it relies on
// webpack module resolution (swapped for an empty module in server bundles)
// to make that safe, which doesn't apply when Jest imports modules directly
// in plain Node. Stub it out to a no-op for tests.
module.exports = {};
