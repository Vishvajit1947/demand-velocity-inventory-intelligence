// Minimum types needed by MT-30 status.ts — verbatim from 05_API_CONTRACT §1.
// TODO(MT-31): extend this file with the full contract types
// (SeriesId, EventInfo, ProductInfo, BoundsResponse, Metrics, Velocity,
// Inventory, Factor, Explainability, Seasonal, ForecastResult,
// Summary, ForecastResponse, ForecastRequest).

export type VelocityStatus =
  | "Critical Decline"
  | "Declining"
  | "Stable"
  | "Growing"
  | "Accelerating";

export type RiskLevel = "Low" | "Medium" | "High";
