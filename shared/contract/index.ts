// API v1 contract — barrel + version marker (D-003 / D-012).
//
// Versioned from day one so the website and the field app target a stable
// surface and we can evolve it without breaking either client. Import contract
// types from here: `import type { QuoteResponse } from "../../shared/contract"`.

export const API_VERSION = "v1" as const;

export * from "./quote";
