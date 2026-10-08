/**
 * Categorical colours for violation and vehicle types.
 *
 * Known codes use the design palette instead of the API colour: the seed gives
 * RED_LIGHT and WRONG_DIRECTION two almost identical reds, which made them
 * indistinguishable in stacked charts and donuts. Unknown codes keep the API colour.
 */
const CATEGORY_COLORS: Record<string, string> = {
  RED_LIGHT: "#f0566a",
  SPEEDING: "#121212",
  ILLEGAL_PARKING: "#f5b740",
  WRONG_DIRECTION: "#8b7cf6",
  STOP_LINE: "#6fd14a",
  LANE_VIOLATION: "#4fb0e6",
  NO_SEATBELT: "#a8a8a3",
  PHONE_USAGE: "#14b8a6",

  CAR: "#121212",
  TRUCK: "#f5b740",
  BUS: "#6fd14a",
  MOTORCYCLE: "#8b7cf6",
  OTHER: "#a8a8a3",
};

export const VEHICLE_STATUS_COLORS: Record<string, string> = { NORMAL: "#a8a8a3", WATCHLIST: "#f5b740", BLACKLIST: "#f0566a" };

const FALLBACK_COLORS = ["#121212", "#6fd14a", "#f5b740", "#f0566a", "#8b7cf6", "#4fb0e6", "#e98a4f", "#a8a8a3"];

export function categoryColor(code: string | null | undefined, apiColor?: string | null, index = 0): string {
  return (code && CATEGORY_COLORS[code]) || apiColor || FALLBACK_COLORS[index % FALLBACK_COLORS.length] || "#a8a8a3";
}
