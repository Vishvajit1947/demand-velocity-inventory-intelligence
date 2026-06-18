/**
 * Shared UI constants shared across panels.
 * PRODUCT_COLORS: semantic per-product colors for forecast lines, legend dots,
 * tooltip text, and product chip active state.
 */

/**
 * Maps series_id → hex color.
 * Each color is chosen to match the real-world identity of the product
 * so that all 8 lines are visually distinct even when overlapping.
 */
export const PRODUCT_COLORS: Record<string, string> = {
  turkey:       "#FF9A3C", // warm amber — roasted, Thanksgiving
  candy:        "#B84FFF", // vivid purple — Halloween
  strawberries: "#FF3D6B", // vivid red-pink — the fruit
  icecream:     "#5BC8FF", // soft sky blue — cold and creamy
  cocoa:        "#C4622D", // rich brown-orange — hot chocolate
  chips:        "#F5D000", // warm yellow-gold — corn, party snack
  milk:         "#C8D8F0", // pale silver-white — milk
  bread:        "#D4A843", // warm wheat tan — baked bread
};

/**
 * Fallback palette used when a series_id is not in PRODUCT_COLORS.
 * Cycles by index for any unknown product.
 */
export const ACCENT_FALLBACK = [
  "#FF9A3C",
  "#B84FFF",
  "#FF3D6B",
  "#5BC8FF",
  "#C4622D",
  "#F5D000",
  "#C8D8F0",
  "#D4A843",
] as const;

/** Resolve a forecast line color: product-specific if known, otherwise cycle by index. */
export function productColor(seriesId: string, idx: number): string {
  return PRODUCT_COLORS[seriesId] ?? ACCENT_FALLBACK[idx % ACCENT_FALLBACK.length];
}
