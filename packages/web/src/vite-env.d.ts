/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEFAULT_SERVER_URL?: string;
}

declare const __APP_BUILD_ID__: string;
declare const __APP_VERSION__: string;
