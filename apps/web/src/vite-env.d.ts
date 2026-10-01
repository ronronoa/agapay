/// <reference types="vite/client" />

// Only non-secret values may carry the VITE_ prefix. Declaring them here stops
// them slipping through as `any` (TS-03).
interface ImportMetaEnv {
  /** Empty means same-origin, which is what the dev proxy and prod provide. */
  readonly VITE_API_BASE_URL?: string;
  // TODO(M3): public site key for the Turnstile widget.
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
