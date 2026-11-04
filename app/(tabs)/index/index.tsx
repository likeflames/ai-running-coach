import React from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, Switch, Pressable, Animated, Easing } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { api, adviceStream, authApi, logout, StatusResp, RecentActivity } from '../../../src/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Markdown } from '../../../src/markdown';
import {
  Screen,
  Card,
  Section,
  Stat,
  Btn,
  Loading,
  ErrorBox,
  Empty,
  Pill,
  List,
  ListRow,
  Segmented,
  ColorDots,
  Divider,
  Progress,
} from '../../../src/ui';
import {
  S,
  T,
  TNUM,
  ACCENTS,
  ACCENT_LIST,
  alpha,
  levelColor,
  tsbColor,
  recoveryColor,
  type Theme,
  type Appearance,
  type AccentId,
} from '../../../src/theme';
import { makeStyles, useTheme, useThemeControl } from '../../../src/theme-provider';
import { F } from '../../../src/format';
import { ACTIVITY_TYPE, zh } from '../../../src/labels';
import { getReminderSettings, setReminderEnabled, ReminderSettings } from '../../../src/notify';

/** 提醒时间预设：够用就好，省得引一个日期选择器 */
const TIME_PRESETS = [
  { h: 6, m: 30, label: '6:30' },
  { h: 7, m: 0, label: '7:00' },
  { h: 7, m: 30, label: '7:30' },
  { h: 8, m: 0, label: '8:00' },
];

export default function TodayScreen() {
  const t = useTheme();
  const s = useStyles();
  const router = useRouter();
  const [data, setData] = React.useState<StatusResp | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [syncing, setSyncing] = React.useState<string | null>(null);
  const [advice, setAdvice] = React.useState<string | null>(null);
  const [adviceLoading, setAdviceLoading] = React.useState(false);
  /** 单独存错误：之前是把错误串写进 advice，界面以为"已经有内容"，
   *  于是永远不显示「重试」按钮，失败一次就卡住 */
  const [adviceErr, setAdviceErr] = React.useState<string | null>(null);
  const [rem, setRem] = React.useState<ReminderSettings>({ enabled: false, hour: 7, minute: 20 });
  const [remBusy, setRemBusy] = React.useState(false);
  /** 当前登录的是谁（只用来在「账号」里显示，不参与业务） */
  const [me, setMe] = React.useState<{ username?: string; display_name?: string; legacy?: boolean } | null>(null);

  React.useEffect(() => {
    getReminderSettings().then(setRem);
  }, []);

  const toggleReminder = async (on: boolean) => {
    setRemBusy(true);
    try {
      const r: any = await setReminderEnabled(on, rem.hour, rem.minute);
      if (!r.ok) {
        setRem({ ...rem, enabled: false });
        Alert.alert(
          '没有通知权限',
          '请到 iPhone「设置 → 通知 → AI跑步教练」里允许通知，再回来打开开关。'
        );
        return;
      }
      setRem({ ...rem, enabled: on });
      if (on && r.scheduled) {
        Alert.alert('已开启', `未来 ${r.scheduled} 天的提醒都排好了。\n每周打开一次 App 会自动往后补。`);
      }
    } catch (e: any) {
      Alert.alert('设置失败', e?.message || '未知错误');
    } finally {
      setRemBusy(false);
    }
  };

  const pickTime = async (h: number, m: number) => {
    const next = { ...rem, hour: h, minute: m };
    setRem(next);
    if (next.enabled) {
      setRemBusy(true);
      try {
        await setReminderEnabled(true, h, m);
      } finally {
        setRemBusy(false);
      }
    }
  };

  const load = React.useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const d = await api.get<StatusResp>('/api/status');
      setData(d);
      setErr(null);
    } catch (e: any) {
      if (!quiet) setErr(e?.message || '加载失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // 回到首页时静默刷新一次：在数据源页同步完切回来，训练和恢复数据要立刻是新的
  const firstFocus = React.useRef(true);
  useFocusEffect(
    React.useCallback(() => {
      authApi.me().then(setMe).catch(() => {});
      if (firstFocus.current) {
        firstFocus.current = false;
        load();
        return;
      }
      load(true);
    }, [load])
  );

  const onLogout = () => {
    Alert.alert('退出登录', '退出后需要重新输入用户名和密码。本地不会删除任何训练数据。', [
      { text: '取消', style: 'cancel' },
      { text: '退出', style: 'destructive', onPress: () => logout() },
    ]);
  };

  const onSync = async (all = false) => {
    setSyncing(all ? '全量' : '增量');
    try {
      await api.post(all ? '/api/sync-all' : '/api/sync', {}, 300000);
      await load(true);
      Alert.alert('同步完成', all ? '已拉取全部历史数据' : '已同步最新训练与恢复数据');
    } catch (e: any) {
      Alert.alert('同步失败', e?.message || '未知错误');
    } finally {
      setSyncing(null);
    }
  };

  const onUpload = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      const file = res.assets[0];
      setSyncing('上传');
      const out = await api.upload('/api/upload-fit', file.uri, file.name, 'application/octet-stream');
      if (out?.success) {
        Alert.alert(
          '解析成功',
          `${out.activity?.distance_km ?? '-'} 公里 · ${out.activity?.avg_pace ?? '-'} · 心率 ${out.activity?.avg_hr ?? '-'}`
        );
        await load(true);
      } else {
        Alert.alert('解析失败', out?.error || '未知错误');
      }
    } catch (e: any) {
      Alert.alert('上传失败', e?.message || '未知错误');
    } finally {
      setSyncing(null);
    }
  };

  const adviceKey = React.useMemo(() => `rc.advice.${new Date().toISOString().slice(0, 10)}`, []);
  /** 流式累积用 ref，避免每个 token 都触发整页重渲染 */
  const adviceBuf = React.useRef('');
  const advicePush = React.useRef(0);
  /** 模型的思考字数：正文出来前用来告诉用户"还在思考"，而不是干等 */
  const [adviceThink, setAdviceThink] = React.useState(0);
  /** 估算进度条：模型给不出真实百分比，按预计耗时长到 92%，完成时补满 */
  const adviceProg = React.useRef(new Animated.Value(0)).current;

  /** 打开时先显示今天已经生成过的那份，不用每次都等 40 秒 */
  React.useEffect(() => {
    AsyncStorage.getItem(adviceKey)
      .then((v) => {
        if (v) setAdvice(v);
      })
      .catch(() => {});
  }, [adviceKey]);

  /**
   * 生成今日建议。
   *
   * 后端生成一次要 30–40 秒（实测 38.7s），一次性请求必然被超时打断，
   * 所以改成 SSE 流式：文字一段段出现，等待感完全不同。
   */
  const loadAdvice = async (fresh = false) => {
    if (adviceLoading) return;
    setAdviceLoading(true);
    setAdviceErr(null);
    setAdvice('');
    adviceBuf.current = '';
    advicePush.current = 0;
    setAdviceThink(0);

    // 进度条先动起来。75 秒到 92%，剩下的等真正完成时再补 —— 宁可在 92% 待久一点，
    // 也不要卡在 99% 假装快好了。
    adviceProg.setValue(0.05);
    Animated.timing(adviceProg, {
      toValue: 0.92,
      duration: 75000,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();

    let failed = '';
    let think = 0;
    let reported = 0;
    try {
      await adviceStream((ev) => {
        if (ev.t === 'content') {
          adviceBuf.current += ev.d || '';
          const now = Date.now();
          if (now - advicePush.current > 120) {
            advicePush.current = now;
            setAdvice(adviceBuf.current);
          }
        } else if (ev.t === 'reasoning') {
          // 思考阶段正文还是空的，只报个字数，让人知道没卡住
          think += (ev.d || '').length;
          if (!adviceBuf.current && think - reported > 120) {
            reported = think;
            setAdviceThink(think);
          }
        } else if (ev.t === 'error') {
          failed = ev.d || '生成失败';
        }
      }, fresh);

      const text = adviceBuf.current;
      if (failed) {
        setAdvice('');
        setAdviceErr(failed);
      } else if (!text.trim()) {
        setAdvice('');
        setAdviceErr('模型这次没有返回内容，再试一次');
      } else {
        setAdvice(text);
        AsyncStorage.setItem(adviceKey, text).catch(() => {});
      }
    } catch (e: any) {
      const partial = adviceBuf.current;
      if (partial.trim()) {
        // 已经显示了一部分：保留，并提示可能不完整
        setAdvice(partial);
        setAdviceErr('输出中断：' + (e?.message || '连接断开'));
      } else {
        setAdvice('');
        setAdviceErr(e?.message || '未知错误');
      }
    } finally {
      Animated.timing(adviceProg, { toValue: 1, duration: 260, useNativeDriver: false }).start();
      setAdviceLoading(false);
    }
  };

  if (loading) return <Loading />;
  if (err && !data)
    return (
      <Screen>
        <ErrorBox message={err} onRetry={() => load()} />
      </Screen>
    );
  if (!data) return null;

  const rec = data.recovery || ({} as any);
  const adv = data.recovery_advice || ({} as any);
  const fit = data.fitness || ({} as any);
  const sleepScore = Number(rec.sleep_score) || 0;
  const recColor = recoveryColor(t, sleepScore);
  const remKey = `${rem.hour}:${rem.minute}`;

  return (
    <Screen refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }}>
      {/* ---------- 恢复 ---------- */}
      <Card>
        <View style={s.cardTop}>
          <Text style={s.eyebrow}>睡眠评分</Text>
          <Text style={s.cardDate}>{rec.date || F.today()}</Text>
        </View>

        <View style={s.heroRow}>
          <Text style={[s.heroNum, { color: recColor }]}>
            {rec.sleep_score ? F.num(rec.sleep_score) : '–'}
          </Text>
          <Text style={[s.heroNote, { color: recColor }]}>
            {sleepScore >= 80 ? '恢复不错' : sleepScore >= 60 ? '还算够用' : sleepScore > 0 ? '偏低了' : '暂无数据'}
          </Text>
        </View>

        <View style={[s.track, { backgroundColor: t.cardInner }]}>
          <View
            style={{
              width: `${Math.max(2, Math.min(100, sleepScore))}%`,
              height: '100%',
              borderRadius: 5,
              backgroundColor: recColor,
            }}
          />
        </View>

        <View style={{ marginTop: S.md }}>
          <Divider />
          <View style={[s.statRow, { marginTop: S.md - 2 }]}>
            <Stat label="心率变异性" value={F.num(rec.hrv)} unit="ms" />
            <Stat
              label="身体电量"
              value={rec.body_battery ? `${Math.round(rec.body_battery)}%` : '-'}
              color={
                Number(rec.body_battery) > 70 ? t.good : Number(rec.body_battery) > 40 ? t.warn : t.bad
              }
            />
            <Stat label="静息心率" value={F.num(rec.resting_hr)} unit="bpm" />
          </View>
          <View style={[s.statRow, { marginTop: S.md }]}>
            <Stat label="压力均值" value={F.num(rec.stress_avg)} />
            <Stat label="睡眠时长" value={rec.sleep_minutes ? F.duration(rec.sleep_minutes) : '-'} />
            <View style={{ flex: 1, minWidth: 70 }} />
          </View>
        </View>
      </Card>

      {/* ---------- 今日建议 ---------- */}
      <Card tint={adv.level ? levelColor(t, adv.level) : undefined}>
        <View style={s.cardTop}>
          <Text style={s.eyebrow}>今日建议</Text>
          {adv.level ? (
            <Pill text={['休息', '轻松', '按计划', '可加量'][adv.level - 1] || ''} color={levelColor(t, adv.level)} />
          ) : null}
        </View>
        <Text style={[s.adviceText, { color: levelColor(t, adv.level) }]}>{adv.advice || '-'}</Text>
        {adv.reason ? <Text style={s.adviceReason}>{adv.reason}</Text> : null}
        {adv.hrv_normal_range ? (
          <Text style={s.adviceFoot}>
            心率变异周均 {F.num(adv.hrv_week_avg, 1)}（正常 {adv.hrv_normal_range[0]}–{adv.hrv_normal_range[1]}，偏离 {F.num(adv.z_score, 2)}）
          </Text>
        ) : null}
      </Card>

      {/* ---------- 体能状态 ---------- */}
      <Card>
        <View style={s.cardTop}>
          <Text style={s.eyebrow}>体能状态</Text>
          <Pill text={fit.status || '-'} color={tsbColor(t, fit.tsb || 0)} />
        </View>
        <View style={[s.statRow, { marginTop: S.sm }]}>
          <Stat label="体能储备" value={F.num(fit.ctl, 1)} />
          <Stat label="近期疲劳" value={F.num(fit.atl, 1)} />
          <Stat label="当前状态" value={F.num(fit.tsb, 1)} color={tsbColor(t, fit.tsb || 0)} />
        </View>
        <View style={[s.statRow, { marginTop: S.md }]}>
          <Stat label="本周跑量" value={F.num(fit.weekly_km, 1)} unit="公里" />
          <Stat
            label="负荷比"
            value={F.num(fit.acwr_ratio, 2)}
            color={fit.acwr_ratio > 1.5 ? t.bad : fit.acwr_ratio > 1.3 ? t.warn : t.good}
          />
          <View style={{ flex: 1, minWidth: 70 }} />
        </View>
      </Card>

      {/* ---------- 最近训练 ---------- */}
      <Section
        title="最近训练"
        right={
          <Pressable onPress={() => router.push('/activities')} hitSlop={8}>
            <Text style={[s.link, { color: t.accent }]}>全部</Text>
          </Pressable>
        }
      >
        {data.recent_activities?.length ? (
          <List>
            {data.recent_activities.map((a, i) => (
              <ActivityRow key={i} a={a} />
            ))}
          </List>
        ) : (
          <Empty text="暂无训练记录，上传 .fit 文件或同步佳明" />
        )}
      </Section>

      {/* ---------- 设置 ---------- */}
      <Section title="设置">
        <List>
          <View style={s.blockRow}>
            <Text style={s.blockLabel}>外观</Text>
            <View style={{ marginTop: S.sm }}>
              <AppearancePicker />
            </View>
          </View>

          <View style={s.blockRow}>
            <Text style={s.blockLabel}>强调色</Text>
            <View style={{ marginTop: S.sm }}>
              <AccentPicker />
            </View>
          </View>

          <ListRow
            title="每日提醒"
            sub="早上提醒今天练什么"
            right={
              remBusy ? (
                <ActivityIndicator color={t.text2} />
              ) : (
                <Switch
                  value={rem.enabled}
                  onValueChange={toggleReminder}
                  trackColor={{ false: t.cardInner, true: t.good }}
                />
              )
            }
          />

          {rem.enabled ? (
            <View style={s.blockRow}>
              <Text style={s.blockLabel}>提醒时间</Text>
              <View style={{ marginTop: S.sm }}>
                <Segmented
                  options={TIME_PRESETS.map((p) => ({ value: `${p.h}:${p.m}`, label: p.label }))}
                  value={remKey}
                  onChange={(v) => {
                    const [h, m] = v.split(':').map(Number);
                    pickTime(h, m);
                  }}
                />
              </View>
            </View>
          ) : null}
        </List>
      </Section>

      {/* ---------- 账号 ---------- */}
      <Section title="账号">
        <List>
          <ListRow
            title={me?.display_name || '当前账号'}
            sub={
              me?.username
                ? `@${me.username} · 数据只有你自己能看到`
                : me?.legacy
                  ? '用访问口令登录 · 建议改成账号密码'
                  : '加载中…'
            }
          />
          <ListRow title="退出登录" onPress={onLogout} chevron />
        </List>
      </Section>

      {/* ---------- 数据 ---------- */}
      <Section title="数据">
        <List>
          <ListRow
            title="数据源"
            sub="佳明 / Oura，可同时连多个"
            onPress={() => router.push('/sources')}
            chevron
          />
          <ListRow
            title="模型"
            sub="用自己的 API Key 跑对话，费用算自己的"
            onPress={() => router.push('/model-config')}
            chevron
          />
          <ListRow
            title={syncing === '增量' ? '同步中…' : '同步佳明'}
            onPress={() => onSync(false)}
            chevron
          />
          <ListRow
            title={syncing === '全量' ? '拉取中…' : '拉取全部历史'}
            onPress={() => onSync(true)}
            chevron
          />
          <ListRow
            title={syncing === '上传' ? '解析中…' : '上传 .fit 文件'}
            onPress={onUpload}
            chevron
          />
        </List>
      </Section>

      {/* ---------- AI 建议正文 ---------- */}
      <Section title="AI 今日训练建议">
        <Card>
          {advice ? (
            <>
              <Markdown text={advice} />
              {adviceLoading ? (
                <View style={{ marginTop: S.md }}>
                  <Progress value={adviceProg} height={4} />
                  <Text style={[s.adviceRegen, { marginTop: S.sm }]}>正在生成…</Text>
                </View>
              ) : null}
              {adviceErr ? <Text style={[s.adviceErrBody, { marginTop: S.sm }]}>{adviceErr}</Text> : null}
              {!adviceLoading ? (
                <Pressable onPress={() => loadAdvice(true)} hitSlop={10} style={{ marginTop: S.md }}>
                  <Text style={s.adviceRegen}>重新生成</Text>
                </Pressable>
              ) : null}
            </>
          ) : adviceLoading ? (
            <View style={{ paddingVertical: S.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm, marginBottom: S.md }}>
                <ActivityIndicator size="small" color={t.accent} />
                <Text style={s.adviceRegen}>
                  {adviceThink > 0 ? `教练正在思考（已 ${adviceThink} 字）` : '正在读取数据…'}
                </Text>
              </View>
              <Progress value={adviceProg} height={5} />
              <Text style={[s.adviceHint, { marginTop: S.md }]}>想完会一段段写出来，不用一直盯着</Text>
            </View>
          ) : adviceErr ? (
            <View style={{ alignItems: 'flex-start' }}>
              <Text style={s.adviceErrTitle}>这次没拿到建议</Text>
              <Text style={s.adviceErrBody}>{adviceErr}</Text>
              <View style={{ marginTop: S.md, alignSelf: 'stretch' }}>
                <Btn title="重试" onPress={() => loadAdvice()} primary />
              </View>
            </View>
          ) : (
            <View style={{ alignItems: 'flex-start' }}>
              <Text style={s.adviceHint}>结合恢复数据、体能与计划，生成今天该怎么练</Text>
              <View style={{ marginTop: S.md, alignSelf: 'stretch' }}>
                <Btn title="生成今日建议" onPress={() => loadAdvice()} primary />
              </View>
            </View>
          )}
        </Card>
      </Section>
    </Screen>
  );
}

/* ---------- 外观（跟随系统 / 浅色 / 深色） ---------- */
function AppearancePicker() {
  const { appearance, setAppearance } = useThemeControl();
  return (
    <Segmented<Appearance>
      options={[
        { value: 'system', label: '跟随系统' },
        { value: 'light', label: '浅色' },
        { value: 'dark', label: '深色' },
      ]}
      value={appearance}
      onChange={setAppearance}
    />
  );
}

/* ---------- 强调色 ---------- */
function AccentPicker() {
  const t = useTheme();
  const { accent, setAccent } = useThemeControl();
  return (
    <ColorDots
      colors={ACCENT_LIST.map((id) => ({ id, color: t.dark ? ACCENTS[id].dark : ACCENTS[id].light }))}
      value={accent}
      onChange={(id) => setAccent(id as AccentId)}
    />
  );
}

function ActivityRow({ a }: { a: RecentActivity }) {
  const s = useStyles();
  const t = useTheme();
  const paceColor = a.avg_pace ? t.text : t.text2;
  return (
    <View style={s.actRow}>
      <View style={{ flex: 1, paddingRight: S.sm }}>
        <Text style={s.actTitle}>
          {F.dayShort(a.date)} · {zh(ACTIVITY_TYPE, a.type, '运动')}
        </Text>
        <Text style={s.actMeta}>
          {F.num(a.distance_km, 2)} 公里 · <Text style={{ color: paceColor }}>{a.avg_pace || '–'}</Text> · 心率{' '}
          {F.num(a.avg_hr)}
        </Text>
      </View>
      {a.notes ? (
        <Text style={s.actNotes} numberOfLines={1}>
          {a.notes}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t: Theme) => ({
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: S.sm,
  },
  eyebrow: { color: t.text2, fontSize: T.caption },
  cardDate: { color: t.text3, fontSize: T.caption, ...TNUM },

  heroRow: { flexDirection: 'row', alignItems: 'baseline', gap: S.sm },
  heroNum: { fontSize: T.hero, fontWeight: '600', letterSpacing: -2, ...TNUM, lineHeight: 54 },
  heroNote: { fontSize: T.body2, fontWeight: '500' },
  track: { height: 8, borderRadius: 5, overflow: 'hidden', marginTop: S.xs },

  statRow: { flexDirection: 'row', gap: S.sm },

  adviceText: { fontSize: 22, fontWeight: '600', letterSpacing: -0.5, lineHeight: 30 },
  adviceReason: { color: t.text2, fontSize: T.body2, lineHeight: 21, marginTop: S.sm - 2 },
  adviceFoot: { color: t.text3, fontSize: T.micro, marginTop: S.sm, lineHeight: 17 },
  adviceBody: { color: t.text, fontSize: T.body2, lineHeight: 24 },
  adviceStreaming: { flexDirection: 'row', alignItems: 'center', gap: S.sm, marginTop: S.md },
  adviceHint: { color: t.text2, fontSize: T.body2, lineHeight: 21 },
  adviceRegen: { color: t.accent, fontSize: T.caption, fontWeight: '500' },
  adviceErrTitle: { color: t.text, fontSize: T.body2, fontWeight: '600', marginBottom: 4 },
  adviceErrBody: { color: t.text3, fontSize: T.caption, lineHeight: 19 },

  link: { fontSize: T.body, fontWeight: '400' },

  blockRow: { paddingHorizontal: S.md, paddingVertical: 12 },
  blockLabel: { color: t.text, fontSize: T.body, letterSpacing: -0.2 },

  actRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: S.md,
    paddingVertical: 11,
    minHeight: 56,
  },
  actTitle: { color: t.text, fontSize: T.body, letterSpacing: -0.2 },
  actMeta: { color: t.text2, fontSize: T.caption, marginTop: 3, ...TNUM },
  actNotes: { color: t.text3, fontSize: T.micro, maxWidth: 110, textAlign: 'right' },
}));
