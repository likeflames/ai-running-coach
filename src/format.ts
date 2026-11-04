/* 格式化工具 */
export const F = {
  /** 2026-11-03 → 11/03 */
  dayShort(d?: string | null) {
    if (!d) return '-';
    const s = String(d).slice(0, 10);
    return `${s.slice(5, 7)}/${s.slice(8, 10)}`;
  },
  /** 2026-11-03 08:05 → 11/03 08:05 */
  dateTime(d?: string | null) {
    if (!d) return '-';
    const s = String(d);
    return `${s.slice(5, 10).replace('-', '/')} ${s.slice(11, 16)}`;
  },
  today() {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },
  /** 分钟 → 1小时26分 */
  duration(min?: number | null) {
    if (!min) return '-';
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return h > 0 ? `${h}小时${m}分` : `${m}分`;
  },
  num(v: any, digits = 0) {
    if (v === null || v === undefined || v === '') return '-';
    const n = Number(v);
    if (Number.isNaN(n)) return String(v);
    return n.toFixed(digits);
  },
  weekLabel(d: string) {
    const dt = new Date(d + 'T00:00:00');
    const names = ['日', '一', '二', '三', '四', '五', '六'];
    return `周${names[dt.getDay()]}`;
  },
  signed(v: number, digits = 1) {
    return `${v > 0 ? '+' : ''}${v.toFixed(digits)}`;
  },
};
