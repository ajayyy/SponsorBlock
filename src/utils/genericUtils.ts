/* Gets percieved luminance of a color */
function getLuminance(color: string): number {
    const {r, g, b} = hexToRgb(color);
    return Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));
}

/* Converts hex color to rgb color */
const hexChars = "0123456789abcdef";
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (hex.length == 4)
    hex = "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  return /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    ? {
        r: hexChars.indexOf(hex[1]) * 16 + hexChars.indexOf(hex[2]),
        g: hexChars.indexOf(hex[3]) * 16 + hexChars.indexOf(hex[4]),
        b: hexChars.indexOf(hex[5]) * 16 + hexChars.indexOf(hex[6]),
  }: null;
}

/**
 * List of all indexes that have the specified value
 * https://stackoverflow.com/a/54954694/1985387
 */
function indexesOf<T>(array: T[], value: T): number[] {
    return array.map((v, i) => v === value ? i : -1).filter(i => i !== -1);
}

export const GenericUtils = {
    getLuminance,
    indexesOf
}
