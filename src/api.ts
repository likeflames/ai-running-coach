/* API 客户端：统一超时、错误处理，对应后端 FastAPI 的接口
 * 支持多地址自动切换：连不上就换下一个候选地址，并记住可用的那个
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CANDIDATES, STORAGE_TOKEN_KEY } from './config';

const DEFAULT_TIMEOUT = 30000;
const PROBE_TIMEOUT = 15000;
const STORAGE_KEY = 'apiBase';

let activeBase: string | null = null;
/** 某些机型上 fetch 走不通但 XHR 可以，记下来优先用 XHR */
let preferXhr = false;
/** 访问口令：服务器开了鉴权时每个请求都要带 */
let accessToken = '';
/** 服务器说口令不对时，回调让 UI 弹出输入框，返回新口令（取消则 null） */
let askTokenHandler: (() => Promise<string | null>) | null = null;

export function getAccessToken() {
  return accessToken;
}

/** UI 层注册「请用户输入口令」的处理函数 */
export function registerTokenPrompt(fn: (() => Promise<string | null>) | null) {
  askTokenHandler = fn;
}

export async function setAccessToken(t: string) {
  accessToken = t.trim();
  try {
    await AsyncStorage.setItem(STORAGE_TOKEN_KEY, accessToken);
  } catch {
    /* ignore */
  }
}

const ready: Promise<void> = (async () => {
  try {
    const [saved, token] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(STORAGE_TOKEN_KEY),
    ]);
    if (saved && API_CANDIDATES.includes(saved)) activeBase = saved;
    if (token) accessToken = token;
  } catch {
    /* ignore */
  }
})();

function orderedBases(): string[] {
  if (!activeBase) return API_CANDIDATES;
  return [activeBase, ...API_CANDIDATES.filter((b) => b !== activeBase)];
}

/** 给请求头补上口令 */
function withAuth(options: RequestInit): RequestInit {
  if (!accessToken) return options;
  const headers: Record<string, string> = { ...((options.headers as any) || {}) };
  headers['X-RC-Token'] = accessToken;
  return { ...options, headers };
}

type Result<T> = { ok: true; data: T } | { ok: false; network: boolean; status?: number; error: Error };

/** 通道一：标准 fetch */
async function fetchOnce<T>(url: string, options: RequestInit, timeoutMs: number): Promise<Result<T>> {
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
      return { ok: false, network: false, status: res.status, error: new Error(`HTTP ${res.status} ${detail}`.trim()) };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (e: any) {
    const msg = String(e?.message || e || '');
    const aborted = e?.name === 'AbortError' || /abort|cancel/i.test(msg);
    return { ok: false, network: true, error: new Error(aborted ? '超时无响应' : msg || '连接失败') };
  } finally {
    clearTimeout(timer);
  }
}

/** 通道二：XHR（和 Safari 更接近的一层，fetch 被系统拦时通常还能用） */
function xhrOnce<T>(url: string, options: RequestInit, timeoutMs: number): Promise<Result<T>> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let done = false;
    const finish = (v: Result<T>) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    // 兜底：XHR 自身不回调时强制结束
    const guard = setTimeout(() => finish({ ok: false, network: true, error: new Error('超时无响应') }), timeoutMs + 3000);

    try {
      xhr.open((options.method as string) || 'GET', url, true);
      const hdrs = (options.headers as Record<string, string>) || {};
      Object.keys(hdrs).forEach((k) => xhr.setRequestHeader(k, String(hdrs[k])));
      xhr.timeout = timeoutMs;
      xhr.onload = () => {
        clearTimeout(guard);
        if (xhr.status >= 200 && xhr.status < 300) {
          let data: any = null;
          try {
            data = JSON.parse(xhr.responseText);
          } catch {
            data = null;
          }
          finish({ ok: true, data });
        } else {
          let detail = '';
          try {
            detail = JSON.parse(xhr.responseText).detail || '';
          } catch {
            /* ignore */
          }
          finish({ ok: false, network: false, status: xhr.status, error: new Error(`HTTP ${xhr.status} ${detail}`.trim()) });
        }
      };
      xhr.onerror = () => {
        clearTimeout(guard);
        finish({ ok: false, network: true, error: new Error('XHR 连接失败') });
      };
      xhr.ontimeout = () => {
        clearTimeout(guard);
        finish({ ok: false, network: true, error: new Error('XHR 超时无响应') });
      };
      xhr.onabort = () => {
        clearTimeout(guard);
        finish({ ok: false, network: true, error: new Error('XHR 被中断') });
      };
      xhr.send((options.body as any) ?? null);
    } catch (e: any) {
      clearTimeout(guard);
      finish({ ok: false, network: true, error: new Error('XHR 异常 ' + (e?.message || '')) });
    }
  });
}

async function rawRequest<T>(url: string, options: RequestInit, timeoutMs: number): Promise<Result<T>> {
  const opts = withAuth(options);
  if (preferXhr) return xhrOnce<T>(url, opts, timeoutMs);

  const r = await fetchOnce<T>(url, opts, timeoutMs);
  if (r.ok || !r.network) return r; // 成功，或服务器已响应（业务错误）

  // fetch 通道失败：换 XHR 再试一次
  const alt = await xhrOnce<T>(url, opts, timeoutMs);
  if (alt.ok || !alt.network) {
    preferXhr = true; // 记住：这台设备用 XHR 才通
    return alt;
  }
  return {
    ok: false,
    network: true,
    error: new Error(`fetch → ${r.error.message}；XHR → ${alt.error.message}`),
  };
}

async function request<T = any>(
  path: string,
  options: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT,
  retried = false
): Promise<T> {
  await ready;
  const bases = orderedBases();

  // 多个候选地址并行发，谁先成功用谁（避免逐个超时干等）
  return new Promise<T>((resolve, reject) => {
    let pending = bases.length;
    let bizFail: { status?: number; error: Error } | null = null;
    let settled = false;
    const notes: string[] = [];

    const finish = () => {
      if (settled) return;
      settled = true;

      if (bizFail) {
        // 口令不对：请用户输入一次，然后重试
        if (bizFail.status === 401 && !retried && askTokenHandler) {
          askTokenHandler()
            .then((t) => {
              if (!t) return reject(new Error('需要访问口令，请在设置里填写'));
              return setAccessToken(t).then(() => request<T>(path, options, timeoutMs, true)).then(resolve, reject);
            })
            .catch(reject);
          return;
        }
        return reject(bizFail.error);
      }

      reject(new Error(`连不上服务器\n${notes.join('\n')}\n请确认手机能正常上网，然后点「重试」`));
    };

    bases.forEach((base) => {
      const isActive = base === activeBase;
      const timeout = isActive ? timeoutMs : Math.min(timeoutMs, PROBE_TIMEOUT);
      const started = Date.now();

      rawRequest<T>(`${base}${path}`, options, timeout)
        .then((r) => {
          if (r.ok) {
            if (settled) return;
            settled = true;
            if (activeBase !== base) {
              activeBase = base;
              AsyncStorage.setItem(STORAGE_KEY, base).catch(() => {});
            }
            resolve(r.data);
            return;
          }
          if (!r.network) {
            // 服务器有响应（业务错误），记下来备用
            if (!bizFail) bizFail = { status: r.status, error: r.error };
          } else {
            const secs = ((Date.now() - started) / 1000).toFixed(1);
            notes.push(`${base.replace(/^https?:\/\//, '')}：${r.error.message}（${secs}s）`);
          }
          if (--pending === 0) finish();
        })
        .catch(() => {
          if (--pending === 0) finish();
        });
    });
  });
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

    const fail = (msg: string, status?: number) => {
      const err: any = new Error(msg);
      err.started = started;
      err.status = status;
      reject(err);
    };

    xhr.open('POST', `${base}/api/chat/stream`);
    xhr.setRequestHeader('Accept', 'text/event-stream');
    if (accessToken) xhr.setRequestHeader('X-RC-Token', accessToken);
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
        fail(`HTTP ${xhr.status} ${detail}`.trim(), xhr.status);
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
  onEvent: (ev: ChatEvent) => void,
  retried = false
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
      // 口令不对：输入一次后整体重来
      if (e?.status === 401 && askTokenHandler && !retried) {
        const t = await askTokenHandler();
        if (t) {
          await setAccessToken(t);
          return chatStream(message, history, onEvent, true);
        }
        throw new Error('需要访问口令，请在设置里填写');
      }
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
