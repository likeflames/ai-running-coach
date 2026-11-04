/* API 客户端：统一超时、错误处理，对应后端 FastAPI 的接口
 * 支持多地址自动切换：连不上就换下一个候选地址，并记住可用的那个
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CANDIDATES } from './config';

const DEFAULT_TIMEOUT = 20000;
const PROBE_TIMEOUT = 6000;
const STORAGE_KEY = 'apiBase';

let activeBase: string | null = null;

const ready: Promise<void> = (async () => {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved && API_CANDIDATES.includes(saved)) activeBase = saved;
  } catch {
    /* ignore */
  }
})();

function orderedBases(): string[] {
  if (!activeBase) return API_CANDIDATES;
  return [activeBase, ...API_CANDIDATES.filter((b) => b !== activeBase)];
}

async function rawRequest<T>(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<{ ok: true; data: T } | { ok: false; network: boolean; error: Error }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.json()).detail || '';
      } catch {
        /* ignore */
      }
      // 服务器有响应（即使报错）说明地址是对的，不再切换
      return { ok: false, network: false, error: new Error(`HTTP ${res.status} ${detail}`.trim()) };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (e: any) {
    const aborted = e?.name === 'AbortError';
    return {
      ok: false,
      network: true,
      error: new Error(aborted ? '请求超时，请检查服务是否运行' : e?.message || '网络错误'),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function request<T = any>(path: string, options: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT): Promise<T> {
  await ready;
  const bases = orderedBases();
  let lastError: Error = new Error('无法连接服务器');

  for (let i = 0; i < bases.length; i++) {
    const base = bases[i];
    const isActive = base === activeBase;
    const timeout = isActive ? timeoutMs : Math.min(timeoutMs, PROBE_TIMEOUT);
    const r = await rawRequest<T>(`${base}${path}`, options, timeout);

    if (r.ok) {
      if (activeBase !== base) {
        activeBase = base;
        AsyncStorage.setItem(STORAGE_KEY, base).catch(() => {});
      }
      return r.data;
    }
    if (!r.network) throw r.error; // 服务器已响应，直接抛出业务错误
    lastError = r.error;
  }
  throw lastError;
}

function qs(params: Record<string, string | number | undefined>) {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export const api = {
  get: <T = any>(path: string) => request<T>(path),

  post: <T = any>(path: string, body: any, timeoutMs = DEFAULT_TIMEOUT) =>
    request<T>(
      path,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      timeoutMs
    ),

  /** 表单提交（后端多个接口用 FormData 接收） */
  form: <T = any>(path: string, data: Record<string, string | number>, timeoutMs = DEFAULT_TIMEOUT) => {
    const fd = new FormData();
    Object.entries(data).forEach(([k, v]) => fd.append(k, String(v)));
    return request<T>(path, { method: 'POST', body: fd as any }, timeoutMs);
  },

  /** 上传文件（.fit） */
  upload: async <T = any>(path: string, uri: string, name: string, mime = 'application/octet-stream', timeoutMs = 120000) => {
    const fd = new FormData();
    // React Native 的 FormData 文件格式
    fd.append('file', { uri, name, type: mime } as any);
    return request<T>(path, { method: 'POST', body: fd as any }, timeoutMs);
  },

  qs,
};

/* ---------------- 流式对话（SSE） ---------------- */

export interface ChatEvent {
  t: 'reasoning' | 'content' | 'tool' | 'error' | 'done';
  d?: string;
}

/**
 * 单地址 SSE 请求。用 XMLHttpRequest 而不是 fetch：
 * React Native 的 fetch 不支持读取流，XHR 的 responseText 会随进度增长。
 */
function streamOnce(
  base: string,
  message: string,
  history: { role: string; content: string }[],
  onEvent: (ev: ChatEvent) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let seen = 0;
    let buf = '';
    let started = false;

    const handle = (block: string) => {
      for (const line of block.split('\n')) {
        const s = line.trim();
        if (!s.startsWith('data:')) continue;
        const payload = s.slice(5).trim();
        if (!payload) continue;
        try {
          const ev = JSON.parse(payload) as ChatEvent;
          started = true;
          onEvent(ev);
        } catch {
          /* 忽略坏包 */
        }
      }
    };

    const flush = () => {
      const total = xhr.responseText || '';
      if (total.length <= seen) return;
      buf += total.slice(seen);
      seen = total.length;
      let idx: number;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        handle(buf.slice(0, idx));
        buf = buf.slice(idx + 2);
      }
    };

    const fail = (msg: string) => {
      const err: any = new Error(msg);
      err.started = started;
      reject(err);
    };

    xhr.open('POST', `${base}/api/chat/stream`);
    xhr.setRequestHeader('Accept', 'text/event-stream');
    xhr.timeout = 300000;
    xhr.onprogress = flush;
    xhr.onload = () => {
      flush();
      if (xhr.status >= 400) {
        let detail = '';
        try {
          detail = JSON.parse(xhr.responseText).detail || '';
        } catch {
          /* ignore */
        }
        fail(`HTTP ${xhr.status} ${detail}`.trim());
        return;
      }
      if (activeBase !== base) {
        activeBase = base;
        AsyncStorage.setItem(STORAGE_KEY, base).catch(() => {});
      }
      resolve();
    };
    xhr.onerror = () => fail('网络错误：连不上服务器');
    xhr.ontimeout = () => fail('请求超时');
    xhr.onabort = () => fail('已取消');

    const fd = new FormData();
    fd.append('message', message);
    fd.append('history', JSON.stringify(history || []));
    xhr.send(fd as any);
  });
}

/**
 * 流式对话：逐段回调思维过程 / 正文。
 * 连接失败会自动换下一个候选地址；一旦开始输出就不再切换（避免内容重复）。
 */
export async function chatStream(
  message: string,
  history: { role: string; content: string }[],
  onEvent: (ev: ChatEvent) => void
): Promise<void> {
  await ready;
  const bases = orderedBases();
  let lastError: Error | null = null;

  for (const base of bases) {
    try {
      await streamOnce(base, message, history, onEvent);
      return;
    } catch (e: any) {
      if (e?.started) throw e;
      lastError = new Error(e?.message || '网络错误');
    }
  }

  throw lastError || new Error('无法连接服务器');
}

/* ---------------- 类型定义 ---------------- */

export interface Recovery {
  date: string;
  sleep_score: number | null;
  sleep_minutes: number | null;
  hrv: number | null;
  hrv_status: string | null;
  body_battery: number | null;
  resting_hr: number | null;
  stress_avg: number | null;
}

export interface RecentActivity {
  date: string;
  type: string;
  duration_min: number;
  distance_km: number;
  avg_pace: string;
  avg_hr: number | null;
  training_load: number | null;
  notes: string | null;
}

export interface Fitness {
  ctl: number;
  atl: number;
  tsb: number;
  weekly_km: number;
  acwr_ratio: number;
  status: string;
}

export interface StatusResp {
  recovery: Recovery;
  recent_activities: RecentActivity[];
  recovery_advice: {
    level: number;
    advice: string;
    reason: string;
    hrv_week_avg: number | null;
    hrv_normal_range: [number, number] | null;
    z_score: number | null;
  };
  fitness: Fitness;
}

export interface Activity {
  id: number;
  date: string;
  distance_km: number;
  duration_min: number;
  avg_pace: string;
  avg_hr: number | null;
  source: string;
  type: string;
  has_track: boolean;
  max_hr?: number | null;
  notes?: string | null;
}

export interface Workout {
  day: string;
  type: string;
  description: string;
  distance_km: number;
  target_pace: string;
}

export interface PlanWeek {
  week: number;
  phase: string;
  target_km: number;
  workouts: Workout[];
}

export interface GuardrailRule {
  id: string;
  severity: 'info' | 'warn' | 'block';
  /** 一句话标题（说人话） */
  title?: string;
  message: string;
  /** 建议怎么处理 */
  action?: string;
  detail?: any[];
}

export interface TrainingPlan {
  vdot: number;
  paces: Record<string, string>;
  race_date: string;
  weeks: PlanWeek[];
  guardrail?: {
    verdict: 'ok' | 'review' | 'block';
    summary: string;
    rules: GuardrailRule[];
    context: { acwr: number; avg_4w_km: number; monotony: number; this_week_load_km?: number };
  };
}

/* ===== 跑步 + 力量合并课表 ===== */

export interface ScheduleRun {
  type: string;
  description: string;
  distance_km: number;
  target_pace: string;
}

export interface ScheduleStrength {
  session: number;
  optional: boolean;
  phase: string;
  label: string;
  duration_min?: number;
  emphasis_label?: string;
  fatigue_label?: string;
  reason: string;
  caution?: string;
}

export interface ScheduleOverride {
  type: string;
  label: string;
  distance_km?: number | null;
  pace?: string | null;
  note?: string | null;
}

export interface ScheduleDay {
  date: string;
  weekday: string;
  is_today: boolean;
  run: ScheduleRun | null;
  strength: ScheduleStrength | null;
  /** 教练/用户手动调整过（覆盖自动排课） */
  override?: ScheduleOverride | null;
}

export interface ScheduleWeek {
  week: number;
  phase: string;
  phase_label: string;
  target_km: number;
  run_days: number;
  strength: {
    phase: string;
    programme_id?: string | null;
    label?: string | null;
    sessions: number;
    sessions_required: number;
    duration_min?: number | null;
    fatigue_label?: string | null;
    note: string;
  };
  days: ScheduleDay[];
}

export interface PhaseOverview {
  phase: string;
  phase_label: string;
  strength_phase: string;
  emphasis_label: string;
  purpose: string;
  sessions_per_week: { min: number; max: number } | null;
  week_from: number;
  week_to: number;
}

export interface TrainingSchedule {
  vdot: number;
  paces: Record<string, string>;
  race_date: string;
  guardrail?: TrainingPlan['guardrail'];
  weeks: ScheduleWeek[];
  programmes: Record<string, StrengthProgramme>;
  phase_overview: PhaseOverview[];
  principles: string[];
  /** 未来 12 周内手动调整过的天数 */
  overrides?: number;
}

export interface WeeklyReport {
  week_start: string;
  week_end: string;
  this_week: {
    total_km: number;
    runs: number;
    duration_hours: number;
    easy_km: number;
    interval_km: number;
    long_km: number;
    other_km: number;
  };
  last_week_km: number;
  km_change: number;
  km_change_pct: number;
  recovery: { avg_hrv: number; avg_sleep: number; avg_body_battery: number };
  fitness: Fitness;
  summary: string;
}

export interface StrengthExercise {
  id: string;
  name: string;
  group: string;
  group_label: string;
  targets: string[];
  equipment: string[];
  equipment_label?: string;
  mode: string;
  mode_label?: string;
  unilateral: boolean;
  side_label?: string;
  cues: string[];
}

export interface StrengthBlock {
  exercise: StrengthExercise;
  sets: number;
  reps?: number | null;
  seconds?: number | null;
  rest_s?: number | null;
  each_side?: boolean;
  tempo?: string;
  load?: string;
}

export interface StrengthProgramme {
  phase_label: string;
  label: string;
  purpose?: string;
  emphasis_label?: string;
  fatigue?: string;
  fatigue_label?: string;
  duration_min: number;
  sessions_per_week: { min: number; max: number };
  blocks: StrengthBlock[];
  warmup?: StrengthExercise[];
  cooldown?: StrengthExercise[];
  notes?: string[];
}
