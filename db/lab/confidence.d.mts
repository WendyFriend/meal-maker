// Types for confidence.mjs, so the app server (TypeScript) can import it.

export type ConfidenceRow = {
    fdc_id: number;
    description: string;
    scope: string;
    score: number;
    matched_via: string;
    tier: string;
    n_routes: number;
    coverage: number;
    desc_words: number;
};

export type Confidence =
    | {
          p: number;
          band: { label: string; min: number; max: number; n: number; observed: number };
          signals: Record<string, number>;
          model: Record<string, unknown>;
      }
    | { error: string };

export function confidenceFor(term: string, rows: ConfidenceRow[]): Promise<Confidence | null>;
