import {
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { getBounds, getProducts, postForecast } from "../lib/api";
import type {
  BoundsResponse,
  ForecastRequest,
  ForecastResponse,
  ProductsResponse,
} from "../lib/types";
import type { ApiError } from "../lib/api";

/** GET /api/products — static, cached long (05 §3). */
export function useProducts(): UseQueryResult<ProductsResponse, ApiError> {
  return useQuery<ProductsResponse, ApiError>({
    queryKey: ["products"],
    queryFn: getProducts,
    staleTime: Infinity,
  });
}

/** GET /api/calendar/bounds — static, cached long (05 §4). */
export function useBounds(): UseQueryResult<BoundsResponse, ApiError> {
  return useQuery<BoundsResponse, ApiError>({
    queryKey: ["bounds"],
    queryFn: getBounds,
    staleTime: Infinity,
  });
}

/**
 * POST /api/forecast — mutation exposing idle/pending/success/error (06 §5).
 * Call .mutate(req) / .mutateAsync(req); read .status, .data, .error.
 *
 * TanStack Query v5 mutation status values: "idle" | "pending" | "success" | "error"
 * These map directly onto the 06 §5 panel states consumed by MT-32.
 */
export function useForecastMutation(): UseMutationResult<
  ForecastResponse,
  ApiError,
  ForecastRequest
> {
  return useMutation<ForecastResponse, ApiError, ForecastRequest>({
    mutationKey: ["forecast"],
    mutationFn: postForecast,
  });
}
