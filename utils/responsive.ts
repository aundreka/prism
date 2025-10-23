import { Dimensions, PixelRatio } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Tune these to your “design” device (e.g., iPhone 13 = 390×844)
const BASE_WIDTH = 390;
const BASE_HEIGHT = 844;

export const scale = (size: number) => (SCREEN_WIDTH / BASE_WIDTH) * size;
export const vscale = (size: number) => (SCREEN_HEIGHT / BASE_HEIGHT) * size;
// Moderate scale: good for icons/text; 0.5 keeps things calm on tablets
export const mscale = (size: number, factor = 0.5) =>
  size + (scale(size) - size) * factor;

// Typography that respects user font settings
export const font = (size: number) => {
  const scaled = mscale(size, 0.4);
  return Math.round(PixelRatio.roundToNearestPixel(scaled));
};

// Breakpoints (tweak as you like)
export const breakpoints = {
  phone: 0,
  largePhone: 400,   // width >= 400
  tablet: 768,       // width >= 768
} as const;

export type BreakpointKey = keyof typeof breakpoints;

export const getBreakpoint = (w = SCREEN_WIDTH): BreakpointKey => {
  if (w >= breakpoints.tablet) return 'tablet';
  if (w >= breakpoints.largePhone) return 'largePhone';
  return 'phone';
};

export const isTablet = (w = SCREEN_WIDTH) => w >= breakpoints.tablet;
