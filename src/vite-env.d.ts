/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_MIN_CLIENT_VERSION?: string
  readonly VITE_SENTRY_DSN?: string
  readonly VITE_APP_RELEASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** نسخة التطبيق وقت البناء (من package.json عبر Vite define). */
declare const __APP_VERSION__: string;
