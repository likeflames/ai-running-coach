/**
 * 主题运行时：外观（跟随系统 / 浅色 / 深色）× 强调色
 *
 * 用法：
 *   const useStyles = makeStyles((t) => ({ card: { backgroundColor: t.card } }));
 *   function Screen() {
 *     const t = useTheme();
 *     const s = useStyles();
 *   }
 *
 * makeStyles 按 theme.id 缓存 StyleSheet，只在主题真正变化时重建。
 */
import React from 'react';
import { StyleSheet, useColorScheme, type ViewStyle, type TextStyle, type ImageStyle } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ACCENTS,
  buildTheme,
  DEFAULT_ACCENT,
  DEFAULT_APPEARANCE,
  FALLBACK_THEME,
  type AccentId,
  type Appearance,
  type Theme,
} from './theme';

const K_APPEARANCE = 'rc.appearance';
const K_ACCENT = 'rc.accent';

type Ctx = {
  t: Theme;
  dark: boolean;
  appearance: Appearance;
  accent: AccentId;
  setAppearance: (a: Appearance) => void;
  setAccent: (a: AccentId) => void;
};

const ThemeCtx = React.createContext<Ctx>({
  t: FALLBACK_THEME,
  dark: false,
  appearance: DEFAULT_APPEARANCE,
  accent: DEFAULT_ACCENT,
  setAppearance: () => {},
  setAccent: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [appearance, setAppearanceState] = React.useState<Appearance>(DEFAULT_APPEARANCE);
  const [accent, setAccentState] = React.useState<AccentId>(DEFAULT_ACCENT);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    Promise.all([AsyncStorage.getItem(K_APPEARANCE), AsyncStorage.getItem(K_ACCENT)])
      .then(([a, c]) => {
        if (a === 'system' || a === 'light' || a === 'dark') setAppearanceState(a);
        if (c && (ACCENTS as any)[c]) setAccentState(c as AccentId);
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  const setAppearance = React.useCallback((next: Appearance) => {
    setAppearanceState(next);
    AsyncStorage.setItem(K_APPEARANCE, next).catch(() => {});
  }, []);

  const setAccent = React.useCallback((next: AccentId) => {
    setAccentState(next);
    AsyncStorage.setItem(K_ACCENT, next).catch(() => {});
  }, []);

  const dark = appearance === 'system' ? system === 'dark' : appearance === 'dark';

  const value = React.useMemo<Ctx>(
    () => ({
      t: buildTheme(dark, accent),
      dark,
      appearance,
      accent,
      setAppearance,
      setAccent,
    }),
    [dark, accent, appearance, setAppearance, setAccent]
  );

  // 没读完本地存储前先不渲染，避免先闪一下浅色再跳深色
  if (!hydrated) return null;

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

/** 当前主题对象 */
export function useTheme(): Theme {
  return React.useContext(ThemeCtx).t;
}

/** 当前是不是深色（状态栏、键盘外观要用） */
export function useIsDark(): boolean {
  return React.useContext(ThemeCtx).dark;
}

/** 外观与强调色的读写 */
export function useThemeControl() {
  const { appearance, accent, setAppearance, setAccent } = React.useContext(ThemeCtx);
  return { appearance, accent, setAppearance, setAccent };
}

/**
 * 把 StyleSheet.create 包成按主题缓存的 hook。
 * 模块顶层调用一次，组件里 `const s = useStyles();`
 *
 * 签名里的 `T & NamedStyles<any>` 不是多余的：它给对象字面量提供上下文类型，
 * 否则 flexDirection、fontWeight 会被推断成 string，RN 组件属性就报类型错。
 */
type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

export function makeStyles<T extends NamedStyles<T> | NamedStyles<any>>(
  fn: (t: Theme) => T & NamedStyles<any>
) {
  const cache = new Map<string, T>();
  return function useThemedStyles(): T {
    const t = useTheme();
    const cached = cache.get(t.id);
    if (cached) return cached;
    const created = StyleSheet.create(fn(t)) as T;
    cache.set(t.id, created);
    return created;
  };
}
