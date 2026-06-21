/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  basePath: "",
  trailingSlash: false,
  reactStrictMode: true,
  // This dashboard sits inside the arca repo (which has its own bun.lock); pin the
  // tracing root to THIS dir so Next doesn't infer the parent workspace.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
