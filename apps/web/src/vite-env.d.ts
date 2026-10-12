/// <reference types="vite/client" />

// Only non-secret values may carry the VITE_ prefix. Declaring them here stops
// them slipping through as `any` (TS-03).
interface ImportMetaEnv {
  /** Empty means same-origin, which is what the dev proxy and prod provide. */
  readonly VITE_API_BASE_URL?: string;
  // Public site key for the Turnstile widget. Unset means keyless dev: the
  // widget renders nothing and the form submits a dev-bypass token.
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
