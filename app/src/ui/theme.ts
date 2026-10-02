import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Mode = 'system' | 'light' | 'dark';

export const lightTheme = {
  bg: '#F8FAFC',
  card: '#FFFFFF',
  surface: '#FFFFFF',
  cardHover: '#F1F5F9',
  surfaceAlt: '#F1F5F9',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  text: '#0F172A',
  textSub: '#475569',
  textMuted: '#64748B',
  primary: '#4F46E5',
  primaryMuted: '#EEF2FF',
  primaryText: '#FFFFFF',
  accent: '#7C3AED',
  accentMuted: '#F5F3FF',
  success: '#059669',
  successBg: '#ECFDF5',
  warn: '#D97706',
  warnBg: '#FFFBEB',
  danger: '#DC2626',
  dangerBg: '#FEF2F2',
  info: '#2563EB',
  infoBg: '#EFF6FF',
  action: '#7C3AED',
  actionBg: '#F5F3FF',
  muted: '#F1F5F9',
  input: '#FFFFFF',
  inputBorder: '#CBD5E1',
  gradientPrimary: ['#4F46E5', '#7C3AED'],
  gradientSuccess: ['#059669', '#10B981'],
  gradientCard: ['#FFFFFF', '#F8FAFC'],
  shadow: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  shadowLg: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 4,
  },
};

export const darkTheme: typeof lightTheme = {
  bg: '#090D16',
  card: '#131B2E',
  surface: '#131B2E',
  cardHover: '#1C2742',
  surfaceAlt: '#1A243B',
  border: '#243250',
  borderStrong: '#33446B',
  text: '#F8FAFC',
  textSub: '#CBD5E1',
  textMuted: '#94A3B8',
  primary: '#6366F1',
  primaryMuted: '#1E1E4B',
  primaryText: '#FFFFFF',
  accent: '#A855F7',
  accentMuted: '#2C1B4D',
  success: '#10B981',
  successBg: '#064E3B',
  warn: '#FBBF24',
  warnBg: '#451A03',
  danger: '#F87171',
  dangerBg: '#450A0A',
  info: '#60A5FA',
  infoBg: '#172554',
  action: '#C084FC',
  actionBg: '#2E1065',
  muted: '#1A243B',
  input: '#0F172A',
  inputBorder: '#283654',
  gradientPrimary: ['#6366F1', '#A855F7'],
  gradientSuccess: ['#059669', '#10B981'],
  gradientCard: ['#131B2E', '#1A243B'],
  shadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 3,
  },
  shadowLg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 6,
  },
};

export type Theme = typeof lightTheme;

interface ThemeCtx {
  theme: Theme;
  mode: Mode;
  isDark: boolean;
  setMode: (mode: Mode) => void;
}

const ThemeContext = createContext<ThemeCtx>({
  theme: lightTheme,
  mode: 'system',
  isDark: false,
  setMode: () => {},
});

const THEME_KEY = 'splitcalc.theme_mode';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<Mode>('system');

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setModeState(saved as Mode);
      }
    });
  }, []);

  const setMode = (newMode: Mode) => {
    setModeState(newMode);
    AsyncStorage.setItem(THEME_KEY, newMode).catch(() => {});
  };

  const isDark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark');
  const theme = isDark ? darkTheme : lightTheme;

  return React.createElement(ThemeContext.Provider, { value: { theme, mode, isDark, setMode } }, children);
}

export const useThemeCtx = () => useContext(ThemeContext);
export const useTheme = (): Theme => useContext(ThemeContext).theme;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, pill: 999 };

export type Tone = 'primary' | 'accent' | 'success' | 'warn' | 'danger' | 'info' | 'action' | 'neutral';

export const toneColors = (t: Theme, tone: Tone) => {
  switch (tone) {
    case 'primary': return { fg: t.primary, bg: t.primaryMuted };
    case 'accent': return { fg: t.accent, bg: t.accentMuted };
    case 'success': return { fg: t.success, bg: t.successBg };
    case 'warn': return { fg: t.warn, bg: t.warnBg };
    case 'danger': return { fg: t.danger, bg: t.dangerBg };
    case 'info': return { fg: t.info, bg: t.infoBg };
    case 'action': return { fg: t.action, bg: t.actionBg };
    default: return { fg: t.textMuted, bg: t.muted };
  }
};

export const STATUS_TONE: Record<string, Tone> = {
  APPROVED: 'success', CONFIRMED: 'success', SETTLED: 'success', ACTIVE: 'success', RESOLVED: 'success', COMPLETED: 'success', PAID: 'info',
  PENDING_APPROVAL: 'warn', PENDING: 'warn', UPCOMING: 'info', DRAFT: 'neutral', INVESTIGATING: 'info', OPEN: 'warn', PAYMENT_INITIATED: 'info', UNDER_REVIEW: 'info',
  DECLINED: 'danger', DISPUTED: 'danger', CANCELLED: 'neutral', ARCHIVED: 'neutral', REJECTED: 'danger', CORRECTED: 'success', INACTIVE: 'neutral',
};

export const LEVEL_TONE: Record<string, Tone> = {
  INFO: 'info', SUCCESS: 'success', WARNING: 'warn', ERROR: 'danger', ACTION_REQUIRED: 'action',
};

export const label = (s?: string | null) =>
  (s ?? '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
