import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy without nonces, so every page can stay static and fast.
 * Wallet-related endpoints are listed explicitly; nothing else may be contacted from the browser.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  [
    "connect-src 'self'",
    // Public RPCs used by the browser wallet layer (read-only, no keys)
    "https://ethereum-rpc.publicnode.com https://eth.drpc.org https://bsc-rpc.publicnode.com https://bsc-dataseed.bnbchain.org",
    "https://base-rpc.publicnode.com https://arb1.arbitrum.io https://polygon-bor-rpc.publicnode.com",
    // WalletConnect relay and services (only used after the user chooses WalletConnect)
    "wss://relay.walletconnect.org wss://relay.walletconnect.com https://*.walletconnect.org https://*.walletconnect.com https://api.web3modal.org https://*.reown.com",
    isDev ? "ws: wss:" : "",
  ]
    .filter(Boolean)
    .join(" "),
  "frame-src https://verify.walletconnect.org https://verify.walletconnect.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  // Friends preview before the official launch (CRYPY_PREVIEW=1 when building): search engines must not index it.
  ...(process.env.CRYPY_PREVIEW === "1" ? [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] : []),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  reactStrictMode: true,
  // Database drivers load native/WebAssembly files at run time: keep them out of the server bundle (M8).
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
