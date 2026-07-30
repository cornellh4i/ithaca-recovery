/** @type {import('next').NextConfig} */
const nextConfig = {
  sassOptions: {
    // Our .module.scss files still use the legacy @import syntax -- silences the resulting
    // Dart Sass deprecation warning (and its noisy "Import traces" dump) without hiding other
    // Sass warnings. Drop this once the styles/ tree migrates to @use.
    silenceDeprecations: ["import"],
  },
};

export default nextConfig;
