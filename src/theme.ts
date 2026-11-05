/**
 * 主题：对齐 iOS 系统语义色
 *
 * 不做"五套彩色皮肤"，走苹果自带 App 那套：
 *  外观（跟随系统 / 浅色 / 深色） × 强调色（六个系统色）
 *
 * 颜色取自 UIKit 的语义色（systemGroupedBackground / secondarySystemGroupedBackground …
 * 深色模式的 hex 值就是苹果官方的深色变体），所以看起来跟系统应用是一家人。
 *
 * 字号用 HIG 的阶梯（正文 17），不再自创一套。
 */

export type Appearance = 'system' | 'light' | 'dark';
export type AccentId = 'blue' | 'green' | 'orange' | 'pink' | 'purple' | 'graphite';

export interface Theme {
  /** 缓存键，也是唯一标识 */
  id: string;
  name: string;
  dark: boolean;
  /** 保留字段：浅色下卡片本身就不需要描边，这里恒为 false */
  bordered: boolean;

  // 底色层级
  bg: string;
  bgSoft: string;
  card: string;
  cardDeep: string;
  cardInner: string;
  border: string;
  borderSoft: string;

  // 文字层级
  text: string;
  text2: string;
  text3: string;

  // 强调色
  accent: string;
  accentInk: string;
  purple: string;

  // 状态色
  good: string;
  warn: string;
  bad: string;

  /** 强调色选择器里的圆点 */
  swatch: [string, string, string];
}

/* ---------- 系统色板 ---------- */

/** 浅色模式的语义色 */
const LIGHT = {
  bg: '#F2F2F7', // systemGroupedBackground
  bgSoft: '#E9E9EF',
  card: '#FFFFFF', // secondarySystemGroupedBackground
  cardDeep: '#F7F7FA',
  cardInner: 'rgba(120,120,128,0.16)', // systemFill
  border: 'rgba(60,60,67,0.29)', // separator
  borderSoft: 'rgba(60,60,67,0.14)',
  text: '#000000', // label
  text2: 'rgba(60,60,67,0.60)', // secondaryLabel
  text3: 'rgba(60,60,67,0.30)', // tertiaryLabel
  good: '#34C759',
  warn: '#FF9500',
  bad: '#FF3B30',
  purple: '#AF52DE',
};

/** 深色模式的语义色（苹果官方的深色变体） */
const DARK = {
  bg: '#000000',
  bgSoft: '#1C1C1E',
  card: '#1C1C1E', // secondarySystemGroupedBackground
  cardDeep: '#161618',
  cardInner: 'rgba(118,118,128,0.24)',
  border: 'rgba(84,84,88,0.65)',
  borderSoft: 'rgba(84,84,88,0.32)',
  text: '#FFFFFF',
  text2: 'rgba(235,235,245,0.60)',
  text3: 'rgba(235,235,245,0.30)',
  good: '#30D158',
  warn: '#FF9F0A',
  bad: '#FF453A',
  purple: '#BF5AF2',
};

/** 六个系统强调色，选一个当主色 */
export const ACCENTS: Record<AccentId, { name: string; light: string; dark: string }> = {
  blue: { name: '蓝', light: '#007AFF', dark: '#0A84FF' },
  green: { name: '绿', light: '#34C759', dark: '#30D158' },
  orange: { name: '橙', light: '#FF9500', dark: '#FF9F0A' },
  pink: { name: '粉', light: '#FF2D55', dark: '#FF375F' },
  purple: { name: '紫', light: '#AF52DE', dark: '#BF5AF2' },
  graphite: { name: '灰', light: '#8E8E93', dark: '#98989D' },
};

export const ACCENT_LIST = Object.keys(ACCENTS) as AccentId[];

/** 拼一套主题。外观 × 强调色，共 12 种组合，但只有 2 套结构。 */
export function buildTheme(dark: boolean, accentId: AccentId): Theme {
  const base = dark ? DARK : LIGHT;
  const a = ACCENTS[accentId] || ACCENTS.blue;
  const accent = dark ? a.dark : a.light;
  return {
    id: `${dark ? 'dark' : 'light'}-${accentId}`,
    name: `${a.name}${dark ? '·深' : '·浅'}`,
    dark,
    bordered: false,
    ...base,
    accent,
    accentInk: '#FFFFFF',
    swatch: [base.card, accent, base.good],
  };
}

/** 默认：跟随系统 + 蓝 */
export const DEFAULT_APPEARANCE: Appearance = 'system';
export const DEFAULT_ACCENT: AccentId = 'blue';

/** 给不需要主题的地方（启动前的兜底）用 */
export const FALLBACK_THEME = buildTheme(false, 'blue');

/* ---------- 尺寸 ---------- */

/** 圆角：10 = iOS 分组列表，16 = 健康 App 卡片 */
export const R = { xs: 8, sm: 10, md: 12, lg: 16, xl: 22, pill: 999 };

/** 间距节奏，iOS 分组列表左右边距是 16 */
export const S = { xs: 4, sm: 8, md: 16, lg: 20, xl: 28 };

/**
 * 字号阶梯，直接照 HIG：
 * largeTitle 34 / title2 22 / headline 17 / body 17 / subhead 15 / footnote 13 / caption 12
 */
export const T = {
  hero: 46,
  big: 28,
  num: 28,
  title: 20,
  body: 17,
  body2: 15,
  caption: 13,
  micro: 12,
};

/** 数字统一用等宽字形，跳动时不左右晃 */
export const TNUM = { fontVariant: ['tabular-nums' as const] };

/* ---------- 颜色推导 ---------- */

/** 恢复等级 1–4 → 颜色 */
export function levelColor(t: Theme, level?: number) {
  return [t.bad, t.warn, t.good, t.accent][(level || 1) - 1] || t.good;
}

/** 状态值（体能 − 疲劳）→ 颜色 */
export function tsbColor(t: Theme, tsb: number) {
  if (tsb < -10) return t.bad;
  if (tsb < 0) return t.warn;
  return t.good;
}

/** 恢复分 0–100 → 平滑色（红 → 黄 → 绿），不是三档硬跳 */
export function recoveryColor(t: Theme, percent: number) {
  const p = Math.max(0, Math.min(100, percent)) / 100;
  if (p < 0.5) return mix(t.bad, t.warn, p / 0.5);
  return mix(t.warn, t.good, (p - 0.5) / 0.5);
}

/** 两个颜色按比例混合，支持 hex 与 rgba */
export function mix(a: string, b: string, ratio: number) {
  const r = clamp01(ratio);
  const A = parseColor(a);
  const B = parseColor(b);
  const c = [0, 1, 2].map((i) => Math.round(A[i] + (B[i] - A[i]) * r));
  const al = A[3] + (B[3] - A[3]) * r;
  return `rgba(${c[0]},${c[1]},${c[2]},${al.toFixed(3)})`;
}

/** 给颜色加透明度，hex / rgba 都吃得下 */
export function alpha(color: string, a: number) {
  const [r, g, b, ca] = parseColor(color);
  return `rgba(${r},${g},${b},${(clamp01(a) * ca).toFixed(3)})`;
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

/** 解析 #rgb / #rrggbb / #rrggbbaa / rgb() / rgba() */
function parseColor(input: string): [number, number, number, number] {
  const s = (input || '').trim();
  if (s.startsWith('#')) {
    let h = s.slice(1);
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return [
      parseInt(h.slice(0, 2), 16) || 0,
      parseInt(h.slice(2, 4), 16) || 0,
      parseInt(h.slice(4, 6), 16) || 0,
      h.length >= 8 ? (parseInt(h.slice(6, 8), 16) || 255) / 255 : 1,
    ];
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const p = m[1].split(',').map((x) => parseFloat(x.trim()));
    return [p[0] || 0, p[1] || 0, p[2] || 0, p.length > 3 && !isNaN(p[3]) ? p[3] : 1];
  }
  return [0, 0, 0, 1];
}
