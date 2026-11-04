import React from 'react';
import { View, Text, Pressable, Animated, Easing, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  api,
  adviceStream,
  getSessionId,
  getSessionGeneration,
  isSessionCurrent,
  StatusResp,
  RecentActivity,
} from '../../../src/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Markdown } from '../../../src/markdown';
import { Screen, Card, Section, Stat, Btn, Loading, ErrorBox, Empty, Pill, List, Divider, Progress } from '../../../src/ui';
import { S, T, TNUM, levelColor, tsbColor, recoveryColor, type Theme } from '../../../src/theme';
import { makeStyles, useTheme } from '../../../src/theme-provider';
import { F } from '../../../src/format';
import { ACTIVITY_TYPE, zh } from '../../../src/labels';

export default function TodayScreen() {
  const t = useTheme();
  const s = useStyles();
  const router = useRouter();
  const [data, setData] = React.useState<StatusResp | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [advice, setAdvice] = React.useState<string | null>(null);
  const [adviceLoading, setAdviceLoading] = React.useState(false);
  const [adviceErr, setAdviceErr] = React.useState<string | null>(null);
  const [adviceThink, setAdviceThink] = React.useState(0);

  const adviceBuf = React.useRef('');
  const advicePush = React.useRef(0);
  const adviceProg = React.useRef(new Animated.Value(0)).current;

  /** 缓存按账号隔离：换账号不能看到上一个人今天的建议 */
  const adviceKey = React.useMemo(
    () => `rc.advice.${getSessionId()}.${new Date().toISOString().slice(0, 10)}`,
    []
  );

  const load = React.useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const gen = getSessionGeneration();
    try {
      const d = await api.get<StatusResp>('/api/status');
      if (!isSessionCurrent(gen)) return;
      setData(d);
      setErr(null);
    } catch (e: any) {
      if (!isSessionCurrent(gen)) return;
      if (!quiet) setErr(e?.message || '加载失败');
    } finally {
      if (isSessionCurrent(gen)) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const firstFocus = React.useRef(true);
  useFocusEffect(
    React.useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        load();
        return;
      }
      load(true);
    }, [load])
  );

  React.useEffect(() => {
    AsyncStorage.getItem(adviceKey)
      .then((v) => {
        if (v) setAdvice(v);
      })
      .catch(() => {});
  }, [adviceKey]);

  const loadAdvice = async (fresh = false) => {
    if (adviceLoading) return;
    const gen = getSessionGeneration();
    setAdviceLoading(true);
    setAdviceErr(null);
    setAdvice('');
    adviceBuf.current = '';
    advicePush.current = 0;
    setAdviceThink(0);

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
        if (!isSessionCurrent(gen)) return;
        if (ev.t === 'content') {
          adviceBuf.current += ev.d || '';
          const now = Date.now();
          if (now - advicePush.current > 120) {
            advicePush.current = now;
            setAdvice(adviceBuf.current);
          }
        } else if (ev.t === 'reasoning') {
          think += (ev.d || '').length;
          if (!adviceBuf.current && think - reported > 120) {
            reported = think;
            setAdviceThink(think);
          }
        } else if (ev.t === 'error') {
          failed = ev.d || '生成失败';
        }
      }, fresh);

      if (!isSessionCurrent(gen)) return;
      const text = adviceBuf.current;
      if (failed) {
        setAdvice('');
        setAdviceErr(failed);
      } else if (!text.trim()) {
        setAdvice('');
        setAdviceErr('这次没有返回内容，再试一次');
      } else {
        setAdvice(text);
        AsyncStorage.setItem(adviceKey, text).catch(() => {});
      }
    } catch (e: any) {
      if (!isSessionCurrent(gen)) return;
      const partial = adviceBuf.current;
      if (partial.trim()) {
        setAdvice(partial);
        setAdviceErr('输出中断，可以重新生成');
      } else {
        setAdvice('');
        setAdviceErr(e?.message || '生成失败');
      }
    } finally {
      if (isSessionCurrent(gen)) {
        Animated.timing(adviceProg, { toValue: 1, duration: 260, useNativeDriver: false }).start();
        setAdviceLoading(false);
      }
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
  const hasAnyData = !!(rec.date || data.recent_activities?.length);

  return (
    <Screen refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }}>
      <View style={s.topRow}>
        <Text style={[s.pageTitle, { color: t.text }]}>今天</Text>
        <Pressable onPress={() => router.push('/settings')} hitSlop={12} style={s.gear}>
          <Text style={[s.gearText, { color: t.text2 }]}>⚙</Text>
        </Pressable>
      </View>

      {!hasAnyData ? (
        <Card>
          <Text style={[s.emptyTitle, { color: t.text }]}>先把数据接上</Text>
          <Text style={[s.emptyBody, { color: t.text2 }]}>
            完善个人资料，再接上佳明、苹果健康或 Oura，之后这里会显示每天的恢复状态和训练建议。
          </Text>
          <View style={{ height: S.md }} />
          <Btn title="完善个人资料" onPress={() => router.push('/profile')} primary />
          <View style={{ height: S.sm }} />
          <Btn title="连接数据源" onPress={() => router.push('/sources')} />
        </Card>
      ) : null}

      {/* ---------- 恢复 ---------- */}
      <Card>
        <View style={s.cardTop}>
          <Text style={[s.eyebrow, { color: t.text2 }]}>睡眠评分</Text>
          <Text style={[s.cardDate, { color: t.text3 }]}>{rec.date || F.today()}</Text>
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

          {/* 睡眠分期：只看总时长会被「躺够 8 小时但深睡只有 40 分钟」骗过去 */}
          {rec.deep_minutes || rec.rem_minutes ? (
            <View style={{ marginTop: S.md }}>
              <View style={s.sleepBar}>
                {(() => {
                  const parts = [
                    { v: rec.deep_minutes || 0, c: '#5E5CE6' },
                    { v: rec.light_minutes || 0, c: '#64D2FF' },
                    { v: rec.rem_minutes || 0, c: '#BF5AF2' },
                    { v: rec.awake_minutes || 0, c: t.text3 },
                  ];
                  const total = parts.reduce((a, b) => a + b.v, 0) || 1;
                  return parts.map((p, i) =>
                    p.v > 0 ? <View key={i} style={{ flex: p.v / total, backgroundColor: p.c }} /> : null
                  );
                })()}
              </View>
              <View style={[s.statRow, { marginTop: S.sm }]}>
                <Stat label="深睡" value={rec.deep_minutes ?? null} unit="分" />
                <Stat label="浅睡" value={rec.light_minutes ?? null} unit="分" />
                <Stat label="REM" value={rec.rem_minutes ?? null} unit="分" />
                <Stat label="清醒" value={rec.awake_minutes ?? null} unit="分" />
              </View>
              {rec.sleep_efficiency ? (
                <Text style={[s.foot, { color: t.text3 }]}>
                  睡眠效率 {F.num(rec.sleep_efficiency, 0)}%
                  {rec.sleep_latency_min ? ` · 入睡耗时 ${rec.sleep_latency_min} 分` : ''}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </Card>

      {/* ---------- 今日建议（规则版） ---------- */}
      {adv.advice ? (
        <Card tint={adv.level ? levelColor(t, adv.level) : undefined}>
          <View style={s.cardTop}>
            <Text style={[s.eyebrow, { color: t.text2 }]}>今天怎么练</Text>
            {adv.level ? (
              <Pill text={['休息', '轻松', '按计划', '可加量'][adv.level - 1] || ''} color={levelColor(t, adv.level)} />
            ) : null}
          </View>
          <Text style={[s.adviceText, { color: levelColor(t, adv.level) }]}>{adv.advice}</Text>
          {adv.reason ? <Text style={[s.adviceReason, { color: t.text2 }]}>{adv.reason}</Text> : null}
        </Card>
      ) : null}

      {/* ---------- 体能状态 ---------- */}
      {hasAnyData ? (
        <Card>
          <View style={s.cardTop}>
            <Text style={[s.eyebrow, { color: t.text2 }]}>体能状态</Text>
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
      ) : null}

      {/* ---------- AI 建议 ---------- */}
      {hasAnyData ? (
        <Section title="教练建议">
          <Card>
            {advice ? (
              <>
                <Markdown text={advice} />
                {adviceLoading ? (
                  <View style={{ marginTop: S.md }}>
                    <Progress value={adviceProg} height={4} />
                    <Text style={[s.regen, { color: t.accent, marginTop: S.sm }]}>正在生成…</Text>
                  </View>
                ) : null}
                {adviceErr ? <Text style={[s.errBody, { color: t.text3, marginTop: S.sm }]}>{adviceErr}</Text> : null}
                {!adviceLoading ? (
                  <Pressable onPress={() => loadAdvice(true)} hitSlop={10} style={{ marginTop: S.md }}>
                    <Text style={[s.regen, { color: t.accent }]}>重新生成</Text>
                  </Pressable>
                ) : null}
              </>
            ) : adviceLoading ? (
              <View style={{ paddingVertical: S.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm, marginBottom: S.md }}>
                  <ActivityIndicator size="small" color={t.accent} />
                  <Text style={[s.regen, { color: t.accent }]}>
                    {adviceThink > 0 ? `教练正在思考（已 ${adviceThink} 字）` : '正在读取数据…'}
                  </Text>
                </View>
                <Progress value={adviceProg} height={5} />
              </View>
            ) : adviceErr ? (
              <View>
                <Text style={[s.errTitle, { color: t.text }]}>这次没拿到建议</Text>
                <Text style={[s.errBody, { color: t.text3 }]}>{adviceErr}</Text>
                <View style={{ marginTop: S.md }}>
                  <Btn title="重试" onPress={() => loadAdvice()} primary />
                </View>
              </View>
            ) : (
              <View>
                <Text style={[s.hint, { color: t.text2 }]}>
                  结合你的恢复数据和最近训练，生成今天该怎么练。
                </Text>
                <View style={{ marginTop: S.md }}>
                  <Btn title="生成今日建议" onPress={() => loadAdvice()} primary />
                </View>
              </View>
            )}
          </Card>
        </Section>
      ) : null}

      {/* ---------- 最近训练 ---------- */}
      <Section
        title="最近训练"
        right={
          data.recent_activities?.length ? (
            <Pressable onPress={() => router.push('/activities')} hitSlop={8}>
              <Text style={[s.link, { color: t.accent }]}>全部</Text>
            </Pressable>
          ) : null
        }
      >
        {data.recent_activities?.length ? (
          <List>
            {data.recent_activities.map((a, i) => (
              <ActivityRow key={i} a={a} />
            ))}
          </List>
        ) : (
          <Empty text="还没有训练记录，去「我的 → 数据源」连一个" />
        )}
      </Section>
    </Screen>
  );
}

function ActivityRow({ a }: { a: RecentActivity }) {
  const s = useStyles();
  const t = useTheme();
  return (
    <View style={s.actRow}>
      <View style={{ flex: 1, paddingRight: S.sm }}>
        <Text style={[s.actTitle, { color: t.text }]}>
          {F.dayShort(a.date)} · {zh(ACTIVITY_TYPE, a.type, '运动')}
        </Text>
        <Text style={[s.actMeta, { color: t.text2 }]}>
          {F.num(a.distance_km, 2)} 公里 · {a.avg_pace || '–'} · 心率 {F.num(a.avg_hr)}
        </Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t: Theme) => ({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: S.md,
    paddingTop: S.sm,
  },
  pageTitle: { fontSize: T.title + 8, fontWeight: '700', letterSpacing: -0.8 },
  gear: { padding: 6 },
  gearText: { fontSize: 22 },

  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: S.sm,
  },
  eyebrow: { fontSize: T.caption },
  cardDate: { fontSize: T.caption, ...TNUM },

  heroRow: { flexDirection: 'row', alignItems: 'baseline', gap: S.sm },
  heroNum: { fontSize: T.hero, fontWeight: '600', letterSpacing: -2, ...TNUM, lineHeight: 54 },
  heroNote: { fontSize: T.body2, fontWeight: '500' },
  track: { height: 8, borderRadius: 5, overflow: 'hidden', marginTop: S.xs },

  statRow: { flexDirection: 'row', gap: S.sm },
  sleepBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' },

  adviceText: { fontSize: 22, fontWeight: '600', letterSpacing: -0.5, lineHeight: 30 },
  adviceReason: { fontSize: T.body2, lineHeight: 21, marginTop: S.sm - 2 },
  foot: { fontSize: T.micro, marginTop: S.sm, lineHeight: 17 },
  hint: { fontSize: T.body2, lineHeight: 21 },
  regen: { fontSize: T.caption, fontWeight: '500' },
  errTitle: { fontSize: T.body2, fontWeight: '600', marginBottom: 4 },
  errBody: { fontSize: T.caption, lineHeight: 19 },
  link: { fontSize: T.body },

  emptyTitle: { fontSize: T.title, fontWeight: '600', marginBottom: 6 },
  emptyBody: { fontSize: T.body2, lineHeight: 21 },

  actRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: S.md,
    paddingVertical: 11,
    minHeight: 56,
  },
  actTitle: { fontSize: T.body, letterSpacing: -0.2 },
  actMeta: { fontSize: T.caption, marginTop: 3, ...TNUM },
}));
