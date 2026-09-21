import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Brief 067 §2 — v5's renames (/exceptions -> /delays-and-blockers,
  // /load -> /who-is-on-what) moved the routes; these keep every
  // existing bookmark, Telegram-pasted link, or old in-app reference
  // working permanently (308) rather than dead-ending. No other route
  // in this app has ever been renamed, so this is the first entry here.
  async redirects() {
    return [
      { source: "/exceptions", destination: "/delays-and-blockers", permanent: true },
      { source: "/load", destination: "/who-is-on-what", permanent: true },
    ];
  },
};

export default nextConfig;
