// TODO(MT-31): typed fetch client (getHealth, getProducts, getBounds, postForecast)
// reading import.meta.env.VITE_API_BASE; throws a typed ApiError on non-2xx (05 §7).
export const API_BASE = import.meta.env.VITE_API_BASE as string;
