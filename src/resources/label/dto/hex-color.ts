// Stricter than class-validator's @IsHexColor(), which also accepts 3/8-digit and '#'-less values
// that wouldn't fit the label's 7-character `color` column.
export const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
export const HEX_COLOR_MESSAGE = 'color must be a hex color in the format #rrggbb';
