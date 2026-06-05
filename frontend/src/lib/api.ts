import type {
  ApiErrorBody,
  BoundsResponse,
  ForecastRequest,
  ForecastResponse,
  HealthResponse,
  ProductsResponse,
} from "./types";

/** Base URL from .env (05 §1, §9). Never hard-code the host. */
export const API_BASE = import.meta.env.VITE_API_BASE as string;

/** Typed error carrying the 05 §7 body. */
export class ApiError extends Error {
  readonly error: string;
  readonly field?: string;
  readonly status: number;

  constructor(body: ApiErrorBody, status: number) {
    super(body.message);
    this.name = "ApiError";
    this.error = body.error;
    this.field = body.field;
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      ...init,
    });
  } catch (_networkErr) {
    throw new ApiError(
      { error: "network_error", message: "Could not reach the server. Is it running?" },
      0,
    );
  }

  if (!res.ok) {
    let body: ApiErrorBody;
    try {
      body = (await res.json()) as ApiErrorBody;
      if (typeof body?.message !== "string") throw new Error("bad error body");
    } catch {
      body = { error: "http_error", message: `Request failed (${res.status}).` };
    }
    throw new ApiError(body, res.status);
  }

  return (await res.json()) as T;
}

/** GET /api/health (05 §2). */
export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/api/health");
}

/** GET /api/products (05 §3). */
export function getProducts(): Promise<ProductsResponse> {
  return request<ProductsResponse>("/api/products");
}

/** GET /api/calendar/bounds (05 §4). */
export function getBounds(): Promise<BoundsResponse> {
  return request<BoundsResponse>("/api/calendar/bounds");
}

/** POST /api/forecast (05 §5). Throws ApiError on 422/500. */
export function postForecast(req: ForecastRequest): Promise<ForecastResponse> {
  return request<ForecastResponse>("/api/forecast", {
    method: "POST",
    body: JSON.stringify(req),
  });
}
