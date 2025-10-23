// constants/theme.ts

// PRISM-inspired iridescent palette
const Prism = {
  // Base pastels pulled from the logo
  cyan:   '#A5F3FC',
  lilac:  '#C7D2FE',
  rose:   '#FBCFE8',
  mint:   '#D1FAE5',
  purple: '#A78BFA', // strong accent (buttons, active states)
  slate0: '#ffffff',
  slate1: '#f8fafc',
  slate2: '#eef2f7',
  slate7: '#0b0b12',
  slate8: '#0f1420',
  slate9: '#111827',
};

export const Theme = {
  // 🎨 COLOR SYSTEM
  colors: {
    light: {
      // Surfaces
      background: Prism.slate0,
      surface: Prism.slate1,
      surfaceAlt: Prism.slate2,
      card: Prism.slate1,
      // Text
      text: '#101114',
      textMuted: '#6b7280',
      // Brand / accents
      primary: Prism.purple,
      accentCyan: Prism.cyan,
      accentLilac: Prism.lilac,
      accentRose: Prism.rose,
      accentMint: Prism.mint,
      // UI
      border: '#e5e7eb',
      shadow: 'rgba(0,0,0,0.10)',
      // Tabs/icons
      tabIconDefault: '#a1a1aa',
      tabIconSelected: Prism.purple,
      // Glass overlays (for frosted UI)
      glass: 'rgba(255,255,255,0.55)',
      glassStrong: 'rgba(255,255,255,0.7)',

      // Gradient tokens (left→right)
      gradientPrimary: [Prism.cyan, Prism.lilac, Prism.rose, Prism.mint],
      gradientEmphasis: ['#9B84F8', '#7DD3FC', '#F9A8D4', '#6EE7B7'],
    },

    dark: {
      background: Prism.slate7,
      surface: Prism.slate8,
      surfaceAlt: Prism.slate9,
      card: Prism.slate8,

      text: '#F3F4F6',
      textMuted: '#9CA3AF',

      primary: '#B7A3FF',
      accentCyan: '#67E8F9',
      accentLilac: '#A5B4FC',
      accentRose: '#F9A8D4',
      accentMint: '#6EE7B7',

      border: '#1f2937',
      shadow: 'rgba(0,0,0,0.6)',
      tabIconDefault: '#6b7280',
      tabIconSelected: '#B7A3FF',

      glass: 'rgba(255,255,255,0.08)',
      glassStrong: 'rgba(255,255,255,0.12)',

      gradientPrimary: ['#67E8F9', '#A5B4FC', '#F9A8D4', '#6EE7B7'],
      gradientEmphasis: ['#B7A3FF', '#60A5FA', '#FB7185', '#34D399'],
    },
  },

  // 🔤 TYPOGRAPHY
  fonts: {
    family: {
      regular: 'System',
      medium: 'System',
      bold: 'System',
    },
    size: {
      xs: 12,
      sm: 14,
      md: 16,
      lg: 20,
      xl: 24,
      title: 32,
      display: 40,
    },
    weight: {
      regular: '400',
      medium: '500',
      bold: '700',
    },
  },

  // 📏 LAYOUT TOKENS
  remBase: 16, // pair with your rem()/font() helpers

  sizes: {
    icon: 24,
    tabIcon: 24,
    headerIcon: 28,
    radius: 14,
    radiusLg: 20,
    tabBarHeight: 64,
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 40,
  },

  // 🌫️ SHADOWS (subtle, glass-friendly)
  shadows: {
    light: {
      small: {
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
        elevation: 2,
      },
      medium: {
        shadowColor: '#000',
        shadowOpacity: 0.10,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
      },
    },
    dark: {
      small: {
        shadowColor: '#000',
        shadowOpacity: 0.35,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3,
      },
      medium: {
        shadowColor: '#000',
        shadowOpacity: 0.55,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
      },
    },
  },

  // 🧠 SEMANTIC ROLES (use these in components)
  semantic: {
    success: '#34D399', // minty success fits the palette
    warning: '#FBBF24',
    danger:  '#FB7185', // rose-ish red
    info:    '#60A5FA',
  },
};

export type ThemeType = typeof Theme;
