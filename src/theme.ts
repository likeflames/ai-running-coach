/* 主题：与 Web 端深色配色保持一致 */
export const C = {
  bg: '#0f1115',
  bgSoft: '#14171e',
  card: '#1e222b',
  cardDeep: '#1a2332',
  cardInner: '#232830',
  border: '#2a2e38',
  borderSoft: '#2c3644',
  text: '#e8eaed',
  text2: '#b0b8c4',
  text3: '#8b92a0',
  accent: '#4fc3f7',
  good: '#66bb6a',
  warn: '#ffa726',
  bad: '#ef5350',
  purple: '#ba68c8',
};

export const R = { sm: 6, md: 10, lg: 14, xl: 20 };

export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 22 };

/** 恢复建议等级 → 颜色 */
export function levelColor(level?: number) {
  return ['#ef5350', '#ffa726', '#66bb6a', '#4fc3f7'][(level || 1) - 1] || C.good;
}

/** TSB（状态）→ 颜色 */
export function tsbColor(tsb: number) {
  if (tsb < -10) return C.bad;
  if (tsb < 0) return C.warn;
  return C.good;
}
