/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** Optional Binance USDⓈ-M WebSocket base (default wss://fstream.binance.com) */
  readonly VITE_BINANCE_FSTREAM_WS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
