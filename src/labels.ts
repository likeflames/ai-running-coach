/* 后端枚举值 → 中文。所有页面统一从这里取，避免出现英文原值 */

/** 训练课类型 */
export const WORKOUT_TYPE: Record<string, string> = {
  easy: '轻松跑',
  long: '长距离',
  tempo: '节奏跑',
  interval: '间歇跑',
  repetition: '重复跑',
  rest: '休息',
  race: '比赛',
  recovery: '恢复跑',
  strength: '力量',
  cross: '交叉训练',
};

/** 活动类型（佳明 activityType） */
export const ACTIVITY_TYPE: Record<string, string> = {
  run: '跑步',
  running: '跑步',
  trail_running: '越野跑',
  treadmill_running: '跑步机',
  track_running: '田径场跑',
  indoor_running: '室内跑',
  street_running: '路跑',
  obstacle_run: '障碍跑',
  ultra_run: '超马',
  walk: '步行',
  hike: '徒步',
  cycling: '骑行',
  bike: '骑行',
  swimming: '游泳',
  strength_training: '力量训练',
  cardio: '有氧',
  other: '其他',
  unknown: '未知',
};

/** 数据来源 */
export const SOURCE: Record<string, string> = {
  garmin: '佳明同步',
  fit_upload: '上传文件',
  manual: '手动录入',
};

/** 训练阶段 */
export const PHASE: Record<string, string> = {
  base: '基础期',
  development: '提升期',
  build: '提升期',
  specific: '巅峰期',
  peak: '巅峰期',
  taper: '赛前减量',
  recovery: '恢复期',
};

/** 配速区间（去掉 E/M/T/I/R 代号，纯中文） */
export const PACE_ZONE: Record<string, string> = {
  easy: '轻松跑',
  marathon: '马拉松配速',
  threshold: '阈值配速',
  interval: '间歇配速',
  repetition: '重复配速',
};

/** 比赛策略 */
export const STRATEGY: Record<string, string> = {
  even: '匀速',
  negative: '后程加速',
  positive: '前程偏快',
};

/** 情景档位 */
export const SCENARIO: Record<string, string> = {
  safe: '保守',
  realistic: '目标',
  ambitious: '激进',
};

/** 安全护栏判定 */
export const VERDICT: Record<string, string> = {
  ok: '计划安全',
  review: '需要注意',
  block: '有安全风险',
};

/** 疲劳等级 */
export const FATIGUE: Record<string, string> = {
  low: '疲劳低',
  moderate: '疲劳中等',
  high: '疲劳较高',
};

/** 安全取值：找不到对应中文时返回兜底文案，绝不把英文原值漏到界面上 */
export function zh(table: Record<string, string>, key?: string | null, fallback = '未分类') {
  if (!key) return fallback;
  return table[key] || fallback;
}

/** 活动类型是否属于跑步（口径与后端 activity_types.is_running 一致） */
const NON_RUN_MARKERS = [
  'ride', 'bike', 'cycl', 'swim', 'walk', 'hik', 'strength', 'weight',
  'cardio', 'row', 'elliptical', 'yoga', 'pilates', 'ski', 'skate',
  '骑行', '单车', '游泳', '步行', '徒步', '力量', '瑜伽', '划船', '滑雪',
];

export function isRunningType(type?: string | null) {
  const t = (type || '').trim().toLowerCase();
  if (!t) return false;
  if (NON_RUN_MARKERS.some((m) => t.includes(m))) return false;
  return t.includes('run') || ['跑步', '越野跑', '跑步机', '室内跑', '田径场跑', '路跑', '超马'].some((k) => t.includes(k));
}

/** 秒 → 1分30秒 */
export function restLabel(s?: number | null) {
  if (!s) return '-';
  if (s < 60) return `${s}秒`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}分${r}秒` : `${m}分钟`;
}

/** 组次：4组 × 6次 / 3组 × 30秒 */
export function setsLabel(sets: number, reps?: number | null, seconds?: number | null) {
  const unit = reps ? `${reps}次` : seconds ? `${seconds}秒` : '';
  return `${sets}组${unit ? ' × ' + unit : ''}`;
}
