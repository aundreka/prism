import { useColorScheme, useWindowDimensions } from 'react-native';
import { Theme } from '@/constants/theme';
import {
  scale, vscale, mscale, font, getBreakpoint, isTablet as _isTablet,
} from '@/utils/responsive';

export function useTheme() {
  const scheme = useColorScheme();
  const { width } = useWindowDimensions();

  const colors = scheme === 'dark' ? Theme.colors.dark : Theme.colors.light;
  const bp = getBreakpoint(width);
  const isTablet = _isTablet(width);

  // rem() scales typography/spacing softly with device width
  const rem = (units: number) => mscale(Theme.remBase * units, 0.4);

  return {
    // palettes
    colors,
    // tokens
    fonts: Theme.fonts,
    spacing: Theme.spacing,
    sizes: Theme.sizes,
    shadows: scheme === 'dark' ? Theme.shadows.dark : Theme.shadows.light,
    // responsive helpers
    rem,
    scale,
    vscale,
    mscale,
    font,
    // breakpoints
    bp,
    isTablet,
  };
}
