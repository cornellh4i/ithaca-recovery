// Shared color helpers for rendering room-colored meeting cards.

const hexToRgb = (hex: string) => {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return { r, g, b };
};

const rgbStringToObject = (rgb: string) => {
  const values = rgb.match(/\d+/g);
  if (!values || values.length < 3) {
    console.log('Invalid RGB string format. Please provide a valid rgb(R, G, B) string.');
    return { r: 0, g: 0, b: 0 }; // Return default values
  }
  return { r: parseInt(values[0]), g: parseInt(values[1]), b: parseInt(values[2]) };
};

/** Lightens a hex or rgb(...) color into a pastel rgb(...) string. */
export const toPastelColor = (color: string): string => {
  let r, g, b;

  if (color.startsWith('#')) {
    ({ r, g, b } = hexToRgb(color));
  } else if (color.startsWith('rgb')) {
    ({ r, g, b } = rgbStringToObject(color));
  } else {
    throw new Error('Invalid color format. Please provide a hex or RGB color.');
  }

  const pastelR = Math.round(r + (255 - r) * 0.7);
  const pastelG = Math.round(g + (255 - g) * 0.7);
  const pastelB = Math.round(b + (255 - b) * 0.7);

  return `rgb(${pastelR}, ${pastelG}, ${pastelB})`;
};
