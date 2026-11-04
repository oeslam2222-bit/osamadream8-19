/// <reference types="vite/client" />
/// <reference types="@testing-library/jest-dom" />

interface ServiceWorkerRegistration {
  sync?: {
    register(tag: string): Promise<void>;
  };
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
