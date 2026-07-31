// Stands in for static image imports (e.g. next/image's `import Logo from "./logo.png"`)
// under jsdom — shaped like Next's StaticImageData so next/image doesn't choke on missing
// width/height.
module.exports = { src: "/test-file-stub.png", height: 100, width: 100 };
