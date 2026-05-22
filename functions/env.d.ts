// This file is not processed by Vite, but is used by TypeScrpt to provide type checking for
// functions.env. It is used in conjunction with the --env-interface flag in wrangler.
// For more information, see: https://developers.cloudflare.com/workers/wrangler/commands/#init
// and https://developers.cloudflare.com/pages/functions/typescript/

// Fix: Import D1Database type to resolve TypeScript error.
// FIX: Changed to `import type` to correctly import type-only definitions.
// FIX: Import D1Database directly from its module to avoid resolution issues.
import type { D1Database } from '@cloudflare/workers-types/d1';

export interface Env {
  DB: D1Database;
}