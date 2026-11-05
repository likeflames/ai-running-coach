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
  /** 业务日期统一按北京时间，跟后端 timezone 字段一致 */
  today() {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date());
      const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
      return `${get('year')}-${get('month')}-${get('day')}`;
    } catch {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }
  },
  /** 分钟 → 1小时26分（先取整再拆分，避免 1小时60分） */
  duration(min?: number | null) {
    if (min === null || min === undefined || Number.isNaN(Number(min))) return '-';
    const total = Math.round(Number(min));
    if (!total) return '-';
    const h = Math.floor(total / 60);
    const m = total % 60;
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
  signed(v: number | null | undefined, digits = 1) {
    if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
    const n = Number(v);
    return `${n > 0 ? '+' : ''}${n.toFixed(digits)}`;
  },
};
