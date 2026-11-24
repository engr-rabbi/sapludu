import type { NextConfig } from "next";

/**
 * Static export: the whole web app is plain HTML/JS/CSS so it can be hosted on
 * GitHub Pages (or any static host). All dynamic behaviour lives in
 *   - Google Apps Script  (auth, accounts, Google Sheets database)
 *   - the Socket.IO server (real-time multiplayer)
 *
 * NEXT_PUBLIC_BASE_PATH is set by the GitHub Pages workflow for project sites
 * (e.g. "/sapludu"). Leave it empty for a custom domain or user/org site.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  transpilePackages: ["@sapludu/engine"],
};

export default nextConfig;
