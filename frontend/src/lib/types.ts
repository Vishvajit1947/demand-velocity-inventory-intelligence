// Mirrors 05_API_CONTRACT.md §1, §3, §4, §5, §7 — EXACT shapes. Do not add/rename fields.

// ── 05 §1 shared vocabulary ───────────────────────────────────────────────
export type SeriesId =
  | "turkey"
  | "candy"
  | "strawberries"
  | "icecream"
  | "cocoa"
  | "chips"
  | "milk"
  | "bread";

export type VelocityStatus =
  | "Critical Decline"
  | "Declining"
  | "Stable"
  | "Growing"
  | "Accelerating";

export type RiskLevel = "Low" | "Medium" | "High";

export interface EventInfo {
  date: string; // ISO YYYY-MM-DD
  name: string;
  type: string;
}

// ── 05 §2 GET /api/health ─────────────────────────────────────────────────
export interface HealthResponse {
  status: string; // "ok"
  model_loaded: boolean;
  version: string; // "1.0.0"
}

// ── 05 §3 GET /api/products ───────────────────────────────────────────────
export type Archetype =
  | "Event-driven"
  | "Seasonal"
  | "Perishable seasonal"
  | "Stable baseline";

export interface ProductInfo {
  series_id: SeriesId;
  item_id: string; // e.g. "FOODS_3_069"
  name: string;
  dept_id: string; // e.g. "FOODS_3"
  archetype: Archetype;
  overall_mean: number;
  seasonal_cv: number;
}

export interface ProductsResponse {
  products: ProductInfo[]; // 8, in SERIES_IDS order
}

// ── 05 §4 GET /api/calendar/bounds ────────────────────────────────────────
export interface BoundsResponse {
  train_start: string;
  train_end: string;
  test_start: string;
  test_end: string;
  first_selectable_date: string;
  last_selectable_date: string;
  horizon: number; // 28
  history_window: number; // 84
}

// ── 05 §5 POST /api/forecast ──────────────────────────────────────────────
export interface ForecastRequest {
  product_ids: SeriesId[]; // non-empty, max 8, dedup'd
  start_date: string; // ISO, within [first_selectable_date, last_selectable_date]
}

export interface History {
  dates: string[]; // length 84, ending start_date - 1
  units: number[]; // length 84
}

export interface Metrics {
  accuracy: number; // max(0, 100 - sMAPE)
  coherence: number;
  coherence_label: "Strong" | "Moderate" | "Weak";
  smape: number;
  mae: number;
  rmse: number;
}

export interface Velocity {
  value: number;
  status: VelocityStatus;
}

export interface Inventory {
  on_hand: number;
  safety_stock: number;
  reorder_point: number;
  horizon_demand: number;
  cover_days: number;
  stockout_risk: RiskLevel;
  overstock: boolean;
  recommended_order_qty: number;
  projected_stock: number[]; // length 28
}

export type FactorKind = "event" | "seasonal" | "trend";

export interface Factor {
  label: string;
  value: number;
  kind: FactorKind;
}

export interface Explainability {
  event_contribution_pct: number;
  snap_days_in_horizon: number;
  narrative: string[];
  factors: Factor[];
}

export interface Seasonal {
  month: number; // 1–12
  month_vs_avg_pct: number;
  monthly_avg: number[]; // length 12 (Jan..Dec)
  weekday_avg: number[]; // length 7 (wday 1..7)
}

/** Map of event name → uplift percent (05 §5 event_uplift). */
export type EventUplift = Record<string, number>;

export interface ForecastResult {
  series_id: SeriesId;
  item_id: string;
  product_name: string;

  history: History;
  horizon_dates: string[]; // length 28

  actual: number[]; // length 28
  forecast: number[]; // length 28, 1 decimal

  metrics: Metrics;
  velocity: Velocity;
  inventory: Inventory;
  explainability: Explainability;

  events_in_horizon: EventInfo[];
  seasonal: Seasonal;
  event_uplift: EventUplift;
}

export interface Summary {
  total_predicted_demand: number;
  high_risk_count: number;
  avg_velocity: number;
  avg_accuracy: number;
  active_events: EventInfo[];
}

export interface ForecastResponse {
  start_date: string;
  horizon: number; // 28
  summary: Summary;
  results: ForecastResult[]; // one per requested product, in request order
}

// ── 05 §7 error shape (422 / 500) ─────────────────────────────────────────
export interface ApiErrorBody {
  error: string; // e.g. "validation_error"
  message: string; // shown in a toast (MT-42)
  field?: string; // omitted for 500s
}
