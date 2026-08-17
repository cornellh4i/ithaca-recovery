/** @type {import('next').NextConfig} */
const nextConfig = {
  // Stamped once at build time (not per-request) -- powers the Diagnostics Application row's
  // "deployed {date}" display. Evaluated here in config, which only runs at build, so this is
  // exempt from the local-timezone Date rule that applies to runtime app code.
  env: {
    NEXT_PUBLIC_BUILD_DATE: new Date().toISOString(),
  },
  // Lets a phone on the same LAN connect to the dev server's HMR websocket -- Next.js blocks
  // cross-origin dev requests by default. Set DEV_LAN_ORIGIN in .env.local (gitignored) to your
  // machine's LAN IP; unset in prod/CI so this is a no-op there.
  ...(process.env.DEV_LAN_ORIGIN
    ? { allowedDevOrigins: [process.env.DEV_LAN_ORIGIN] }
    : {}),
  // Dev-only overlay badge defaults to bottom-left, which is where it naturally sits -- kept
  // explicit since the mobile New Meeting FAB (MobileFab.tsx) is pinned bottom-right and the
  // two would otherwise be one accidental FAB-position change away from overlapping again.
  // Doesn't exist in production, so this is purely a local/dev-server ergonomics fix.
  devIndicators: {
    position: "bottom-left",
  },
  sassOptions: {
    // Our .module.scss files still use the legacy @import syntax -- silences the resulting
    // Dart Sass deprecation warning (and its noisy "Import traces" dump) without hiding other
    // Sass warnings. Drop this once the styles/ tree migrates to @use.
    silenceDeprecations: ["import"],
  },
  // /docs/<slug>.md serves that doc's raw markdown (GitHub-raw-URL-style), via a real Route
  // Handler at /api/docs-raw -- app/(main)/docs/[[...slug]]/page.tsx can't handle this itself,
  // since Next.js doesn't allow a route.ts and a page.tsx to resolve the same URL, and a page
  // component can't return a non-HTML Response body anyway. :slug(.*) matches zero or more path
  // segments (including none, for the root doc's /docs.md), rewritten transparently -- the
  // browser's address bar still shows the clean /docs/<slug>.md URL, not /api/docs-raw.
  // Handoff/development docs are noindexed via a response header rather than (only) meta
  // robots: Next streams metadata for dynamic routes, so the meta tag can land after hydration
  // (or never, if hydration trips) -- a header is crawler-equivalent and unconditional. The
  // user guide stays indexable.
  async headers() {
    return ["/docs/02-handoff/:path*", "/docs/03-development/:path*"].map((source) => ({
      source,
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    }));
  },
  async rewrites() {
    return [
      {
        source: "/docs/:slug(.*)\\.md",
        destination: "/api/docs-raw/:slug",
      },
      {
        // The root doc's slug is "" (see loadDocs.ts's DocEntry) -- no slash before ".md" to
        // match the pattern above, so it needs its own literal rule.
        source: "/docs.md",
        destination: "/api/docs-raw",
      },
    ];
  },
};

export default nextConfig;
