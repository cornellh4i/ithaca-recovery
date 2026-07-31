/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets a phone on the same LAN connect to the dev server's HMR websocket -- Next.js blocks
  // cross-origin dev requests by default. Set DEV_LAN_ORIGIN in .env.local (gitignored) to your
  // machine's LAN IP; unset in prod/CI so this is a no-op there.
  ...(process.env.DEV_LAN_ORIGIN
    ? { allowedDevOrigins: [process.env.DEV_LAN_ORIGIN] }
    : {}),
  // Dev-only overlay badge defaults to bottom-left, the same corner the mobile New Meeting
  // FAB (MobileFab.tsx) is pinned to per spec -- it visually and pointer-event-wise covers
  // the FAB in dev (confirmed via e2e: "intercepts pointer events"). Doesn't exist in
  // production, so this is purely a local/dev-server ergonomics fix.
  devIndicators: {
    position: "bottom-right",
  },
  sassOptions: {
    // Our .module.scss files still use the legacy @import syntax -- silences the resulting
    // Dart Sass deprecation warning (and its noisy "Import traces" dump) without hiding other
    // Sass warnings. Drop this once the styles/ tree migrates to @use.
    silenceDeprecations: ["import"],
  },
};

export default nextConfig;
