/* 每日训练提醒（iOS 本地通知）
 *
 * 为什么用本地通知而不是服务器推送：
 *   免费 Apple ID 签名用不了 APNs，本地通知不需要证书、不需要开发者账号。
 *
 * 工作方式：
 *   App 打开时拉一次课表，把未来 7 天每天的训练写成一条定时通知。
 *   所以只要一周内打开过一次 App，提醒就不会断。
 *
 * 两个限制（都是免费签名的固有限制，不是 bug）：
 *   1. 签名 7 天过期后 App 打不开，通知也会一起失效——重签后打开 App 会自动补回来
 *   2. iOS 每个 App 最多 64 条待发通知，我们只用 7 条，够
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api, getSessionId } from './api';

/**
 * 提醒设置按账号分开存。
 * 以前是一份全局设置，换账号后上一个人的提醒还在，还会用新账号的课表重排 —— 两头都错。
 */
function keyOf(base: string) {
  return `rc.reminders.${getSessionId()}.${base}`;
}
const KEY_ENABLED = () => keyOf('enabled');
const KEY_HOUR = () => keyOf('hour');
const KEY_MINUTE = () => keyOf('minute');

export const DEFAULT_HOUR = 7;
export const DEFAULT_MINUTE = 20;
/** 一次排多少天，和「一周打开一次」的节奏对齐 */
const DAYS_AHEAD = 7;

export type ReminderSettings = {
  enabled: boolean;
  hour: number;
  minute: number;
};

export async function getReminderSettings(): Promise<ReminderSettings> {
  try {
    const [en, h, m] = await Promise.all([
      AsyncStorage.getItem(KEY_ENABLED()),
      AsyncStorage.getItem(KEY_HOUR()),
      AsyncStorage.getItem(KEY_MINUTE()),
    ]);
    return {
      enabled: en === '1',
      hour: h ? Number(h) : DEFAULT_HOUR,
      minute: m ? Number(m) : DEFAULT_MINUTE,
    };
  } catch {
    return { enabled: false, hour: DEFAULT_HOUR, minute: DEFAULT_MINUTE };
  }
}

async function saveSettings(s: ReminderSettings) {
  await AsyncStorage.multiSet([
    [KEY_ENABLED(), s.enabled ? '1' : '0'],
    [KEY_HOUR(), String(s.hour)],
    [KEY_MINUTE(), String(s.minute)],
  ]);
}

/** 申请通知权限，返回是否通过 */
export async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  const ask = await Notifications.requestPermissionsAsync();
  return !!ask.granted;
}

/** 把一条通知的文案拼出来：说人话，不用术语 */
function buildContent(date: string, run: any | null, strength: any | null) {
  const parts: string[] = [];

  if (run) {
    const dist = Number(run.distance_km || 0);
    const head = dist > 0 ? `${run.type} ${dist} 公里` : run.type;
    const pace = run.target_pace && run.target_pace !== '-' ? `，配速 ${run.target_pace}` : '';
    parts.push(`${head}${pace}`);
    if (run.description) parts.push(run.description);
  } else {
    parts.push('今天不跑，让身体恢复');
  }

  if (strength) {
    const label = strength.label || '力量训练';
    const dur = strength.duration_min ? ` ${strength.duration_min} 分钟` : '';
    const opt = strength.optional ? '（可选）' : '';
    parts.push(`力量：${label}${dur}${opt}`);
  }

  const isRest = !run;
  return {
    title: isRest ? '今天休息' : '今天该练什么',
    body: parts.join('\n'),
  };
}

/** 取消所有已排的提醒（只取消我们自己排的） */
async function clearAll() {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => (n.content?.data as any)?.kind === 'daily-training')
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );
  } catch {
    /* ignore */
  }
}

/**
 * 按课表重建未来 7 天的提醒。
 * 课表拉不到时保留原有通知不动，避免因为一次网络失败把提醒清空。
 */
export async function syncReminders(settings?: ReminderSettings): Promise<{ scheduled: number; error?: string }> {
  const s = settings || (await getReminderSettings());
  if (!s.enabled) {
    await clearAll();
    return { scheduled: 0 };
  }
  if (Platform.OS === 'web') return { scheduled: 0, error: '网页版不支持本地提醒' };

  let schedule: any;
  try {
    schedule = await api.get('/api/training/schedule');
  } catch (e: any) {
    return { scheduled: 0, error: e?.message || '课表拉取失败' };
  }

  // 把 26 周的 days 摊平，只留今天及以后 7 天
  const days: any[] = [];
  for (const w of schedule?.weeks || []) {
    for (const d of w.days || []) days.push(d);
  }
  if (!days.length) return { scheduled: 0, error: '课表里没有数据' };

  const todayKey = new Date().toISOString().slice(0, 10);
  const picked = days
    .filter((d) => d.date && d.date >= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, DAYS_AHEAD);

  await clearAll();

  let scheduled = 0;
  for (const d of picked) {
    const [y, mo, da] = String(d.date).split('-').map(Number);
    const when = new Date(y, mo - 1, da, s.hour, s.minute, 0, 0);
    if (when.getTime() <= Date.now()) continue; // 今天的时间已经过了

    const { title, body } = buildContent(d.date, d.run, d.strength);
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: true,
          data: { kind: 'daily-training', date: d.date },
        } as any,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: when,
        } as any,
      });
      scheduled += 1;
    } catch {
      /* 单条失败不影响其他 */
    }
  }

  return { scheduled };
}

/** 打开/关闭提醒 */
export async function setReminderEnabled(enabled: boolean, hour = DEFAULT_HOUR, minute = DEFAULT_MINUTE) {
  if (enabled) {
    const ok = await ensurePermission();
    if (!ok) {
      await saveSettings({ enabled: false, hour, minute });
      return { ok: false, reason: 'permission' as const };
    }
  }
  const settings: ReminderSettings = { enabled, hour, minute };
  await saveSettings(settings);
  const r = await syncReminders(settings);
  return { ok: true as const, ...r };
}
