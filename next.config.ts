import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  org: "moritz-lampe",
  project: "javascript-nextjs",
  // Build-Logs nur in CI ausgeben (lokal still).
  silent: !process.env.CI,
  // Source-Maps fuer den gesamten Client-Output hochladen (lesbare Traces).
  widenClientFileUpload: true,
  // disableLogger bewusst weggelassen: in @sentry/nextjs v10 deprecated und
  // unter Turbopack (dieser Build) wirkungslos -> wuerde nur Deprecation-Noise
  // erzeugen. Kein funktionaler Verlust.
  // KEIN tunnelRoute: proxy.ts-Matcher wuerde /monitoring durch getUser()
  // schicken -> Redirect /login. proxy.ts ist auth-kritisch, wird nicht angefasst.
});
