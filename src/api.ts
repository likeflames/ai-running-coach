/* API 客户端：统一超时、错误处理，对应后端 FastAPI 的接口
 * 支持多地址自动切换：连不上就换下一个候选地址，并记住可用的那个
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CANDIDATES, STORAGE_TOKEN_KEY } from './config';

/* 超时：服务器实测 20–50ms，正常请求一两秒就回来。
 * 之前设 30s，配上「fetch 失败再换 XHR」的串行重试，最坏要干等 60 秒才报错，
 * 而这个 60 秒里往往是服务器正在重启 —— 等它重启完早就好了。所以压到 12s。 */
const DEFAULT_TIMEOUT = 12000;
const PROBE_TIMEOUT = 5000;
/* 换过一次键名：旧版记住的是 http://IP，改域名优先后如果不换键，
 * 覆盖安装的用户会一直被旧记忆绑在明文 IP 上（orderedBases 把记住的地址排第一，
 * 而且内网 IP 响应比 TLS 握手快，几乎每次都赢）。换键 = 让旧记忆自然失效。
 * 以后再换主地址，同样改这里的版本号即可。 */
const STORAGE_KEY = 'apiBaseV2';

/* 默认就认首选地址可用：这样首次启动的长请求（同步/流式对话）能拿到完整超时，
 * 而不是被当成「探测」只给 5 秒。真连不上时，并发候选会兜住并自动切换。 */
let activeBase: string | null = API_CANDIDATES[0];
/** 某些机型上 fetch 走不通但 XHR 可以，记下来优先用 XHR */
let preferXhr = false;
/** 访问口令：服务器开了鉴权时每个请求都要带 */
let accessToken = '';
/** 服务器说口令不对时，回调让 UI 弹出输入框，返回新口令（取消则 null） */
let askTokenHandler: (() => Promise<string | null>) | null = null;

/**
 * 会话代际。登录/退出都 +1。
 *
 * 为什么需要它：切账号时上一个账号的请求可能还在路上（尤其是 30 秒的流式对话），
 * 回来以后如果直接 setState，新账号的界面就会显示旧账号的数据。
 * 所有异步回调在落地前都比一次代际，不一致就丢弃。
 */
let generation = 0;

export class SessionChangedError extends Error {
  constructor() {
    super('登录状态已变化');
    this.name = 'SessionChangedError';
  }
}

export function getSessionGeneration() {
  return generation;
}

/** token 里带 uid（v2.<uid>.<ver>.<exp>.<sig>），拿不到就返回 anonymous */
export function getSessionId(): string {
  const parts = (accessToken || '').split('.');
  if (parts.length >= 5 && parts[0] === 'v2') return parts[1];
  return 'anonymous';
}

export function isSessionCurrent(g: number) {
  return g === generation;
}

export function getAccessToken() {
  return accessToken;
}

/** 当前实际连通的服务器地址，给「配置快捷指令」这类需要完整 URL 的地方用 */
export function getApiBase() {
  return activeBase || API_CANDIDATES[0];
}

/** UI 层注册「请用户输入口令」的处理函数 */
export function registerTokenPrompt(fn: (() => Promise<string | null>) | null) {
  askTokenHandler = fn;
}

export async function setAccessToken(t: string) {
  const next = t.trim();
  const changed = next !== accessToken;
  accessToken = next;
  if (changed) generation += 1;
  try {
    if (next) await AsyncStorage.setItem(STORAGE_TOKEN_KEY, next);
    else await AsyncStorage.removeItem(STORAGE_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** 退出登录后要做的事（登录门注册进来，用来把界面切回登录页） */
let logoutHandler: (() => void) | null = null;

export function registerLogoutHandler(fn: (() => void) | null) {
  logoutHandler = fn;
}

/** 清掉本账号的本地缓存（建议正文、提醒设置等），换账号时不带走 */
async function clearLocalCaches() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter(
      (k) => k.startsWith('rc.advice.') || k.startsWith('rc.reminders.') || k === 'rc.reminder'
    );
    if (mine.length) await AsyncStorage.multiRemove(mine);
  } catch {
    /* ignore */
  }
}

/**
 * 退出登录：先让服务器把 token 作废（auth_version +1，别的设备也一起掉线），
 * 再清本地。服务器连不上也照样本地退出，不能把人卡在登录态里。
 */
export async function logout() {
  const token = accessToken;
  if (token) {
    try {
      await fetch(`${activeBase || API_CANDIDATES[0]}/api/auth/logout`, {
        method: 'POST',
        headers: { 'X-RC-Token': token },
      });
    } catch {
      /* 离线也要能退 */
    }
  }
  await clearLocalCaches();
  await setAccessToken('');
  logoutHandler?.();
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
  retried = false,
  promptOn401 = true
): Promise<T> {
  await ready;
  const gen = generation;
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

      // 请求发出后用户换了账号：旧结果一律丢弃，不能显示到新账号界面上
      if (!isSessionCurrent(gen)) return reject(new SessionChangedError());

      if (bizFail) {
        if (bizFail.status === 401 && promptOn401) {
          // 密码登录没有「再输一次口令」这条路，直接回登录页
          setAccessToken('').finally(() => logoutHandler?.());
          return reject(new Error('登录已失效，请重新登录'));
        }
        return reject(bizFail.error);
      }

      reject(new Error('连不上服务器，检查网络后再试'));
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
            if (!isSessionCurrent(gen)) return reject(new SessionChangedError());
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

  /** 更新配置（模型 key、数据源凭据） */
  put: <T = any>(path: string, body: any, timeoutMs = DEFAULT_TIMEOUT) =>
    request<T>(
      path,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      timeoutMs
    ),

  del: <T = any>(path: string, timeoutMs = DEFAULT_TIMEOUT) =>
    request<T>(path, { method: 'DELETE' }, timeoutMs),

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

/* ---------------- 登录 ---------------- */
/**
 * 登录相关接口单独走一套：401 时不弹「访问口令」框。
 * 那套自动重试是给「口令过期」用的；登录页自己要能拿到 401 去提示
 * 「用户名或密码不对」，否则会弹一个不相干的输入框盖在上面。
 */
export const authApi = {
  status: <T = any>() => request<T>('/api/auth/status', {}, DEFAULT_TIMEOUT, false, false),

  login: <T = any>(username: string, password: string) =>
    request<T>(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      },
      DEFAULT_TIMEOUT,
      false,
      false
    ),

  register: <T = any>(username: string, password: string, invite: string, displayName = '') =>
    request<T>(
      '/api/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          invite,
          display_name: displayName,
        }),
      },
      DEFAULT_TIMEOUT,
      false,
      false
    ),

  me: <T = any>() => request<T>('/api/auth/me', {}, DEFAULT_TIMEOUT, false, false),
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
function sseOnce(
  base: string,
  path: string,
  form: FormData | null,
  onEvent: (ev: ChatEvent) => void,
  timeoutMs = 300000
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

    xhr.open(form ? 'POST' : 'GET', `${base}${path}`);
    xhr.setRequestHeader('Accept', 'text/event-stream');
    if (accessToken) xhr.setRequestHeader('X-RC-Token', accessToken);
    xhr.timeout = timeoutMs;
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

    xhr.send((form as any) || null);
  });
}

/** 流式对话用：POST 表单到 /api/chat/stream */
function streamOnce(
  base: string,
  message: string,
  history: { role: string; content: string }[],
  onEvent: (ev: ChatEvent) => void
): Promise<void> {
  const fd = new FormData();
  fd.append('message', message);
  fd.append('history', JSON.stringify(history || []));
  return sseOnce(base, '/api/chat/stream', fd, onEvent);
}

/**
 * 今日训练建议（流式）。后端生成一次要 30–40 秒，
 * 一次性请求在手机上必然超时，改成边生成边显示。
 * fresh=true 让服务端跳过当天缓存、重新生成。
 */
export async function adviceStream(
  onEvent: (ev: ChatEvent) => void,
  fresh = false,
  retried = false
): Promise<void> {
  await ready;
  const gen = generation;
  const bases = orderedBases();
  const path = fresh ? '/api/daily-advice/stream?fresh=1' : '/api/daily-advice/stream';
  let lastError: Error | null = null;

  for (const base of bases) {
    if (!isSessionCurrent(gen)) throw new SessionChangedError();
    try {
      await sseOnce(base, path, null, (ev) => {
        if (isSessionCurrent(gen)) onEvent(ev);
      }, 180000);
      return;
    } catch (e: any) {
      if (e?.started) throw e;
      if (e?.status === 401) {
        await setAccessToken('');
        logoutHandler?.();
        throw new Error('登录已失效，请重新登录');
      }
      lastError = new Error(e?.message || '网络错误');
    }
  }

  throw lastError || new Error('无法连接服务器');
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
  const gen = generation;
  const bases = orderedBases();
  let lastError: Error | null = null;

  for (const base of bases) {
    if (!isSessionCurrent(gen)) throw new SessionChangedError();
    try {
      await streamOnce(base, message, history, (ev) => {
        if (isSessionCurrent(gen)) onEvent(ev);
      });
      return;
    } catch (e: any) {
      if (e?.started) throw e;
      // 切了账号就不再重试：旧对话不能带着新账号的 token 再发一次
      if (e?.status === 401) {
        await setAccessToken('');
        logoutHandler?.();
        throw new Error('登录已失效，请重新登录');
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
  /** Oura 独有：准备度 / 体温偏移 / 夜间平均心率 */
  readiness_score?: number | null;
  temp_deviation?: number | null;
  night_hr?: number | null;
  /** 睡眠分期（分钟），Oura 和佳明都给 */
  deep_minutes?: number | null;
  light_minutes?: number | null;
  rem_minutes?: number | null;
  awake_minutes?: number | null;
  sleep_efficiency?: number | null;
  sleep_latency_min?: number | null;
  source?: string | null;
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
