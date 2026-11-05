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
import { Screen, Card, Section, Btn, Loading, ErrorBox, Empty, Pill, List, Progress, Fold } from '../../../src/ui';
import { Gauge, Donut, SegmentRing, RingLegend, Bullet } from '../../../src/charts';
import DataView from '../../../src/views/DataView';
import { S, T, R, TNUM, alpha, levelColor, tsbColor, recoveryColor, type Theme } from '../../../src/theme';
import { makeStyles, useTheme } from '../../../src/theme-provider';
import { F } from '../../../src/format';
import { ACTIVITY_TYPE, zh } from '../../../src/labels';

interface FitnessPoint {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
  combined_atl?: number;
  combined_tsb?: number;
  weekly_km: number;
}

const HRV_STATUS_ZH: Record<string, string> = {
  BALANCED: '平衡',
  UNBALANCED: '不平衡',
  LOW: '偏低',
  POOR: '偏低',
  NORMAL: '正常',
};

export default function TodayScreen() {
  const t = useTheme();
  const s = useStyles();
  const router = useRouter();
  const [data, setData] = React.useState<StatusResp | null>(null);
  const [history, setHistory] = React.useState<FitnessPoint[]>([]);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [advice, setAdvice] = React.useState<string | null>(null);
  const [adviceLoading, setAdviceLoading] = React.useState(false);
  const [adviceErr, setAdviceErr] = React.useState<string | null>(null);
  const [adviceThink, setAdviceThink] = React.useState(0);
  /** build 17：「今天 / 数据」在页内切换，底部仍是 3 个主标签、图表仍只画一次 */
  const [view, setView] = React.useState<'today' | 'data'>('today');
  const [dataKey, setDataKey] = React.useState(0);

  const adviceBuf = React.useRef('');
  const advicePush = React.useRef(0);
  const adviceProg = React.useRef(new Animated.Value(0)).current;

  /** 缓存按账号隔离：换账号不能看到上一个人今天的建议 */
  const adviceKey = React.useMemo(
    () => `rc.advice.${getSessionId()}.${F.today()}`,
    []
  );

  const load = React.useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const gen = getSessionGeneration();
    try {
      const [d, h] = await Promise.all([
        api.get<StatusResp>('/api/status'),
        api.get<{ series: FitnessPoint[] }>('/api/fitness/history?days=14').catch(() => ({ series: [] })),
      ]);
      if (!isSessionCurrent(gen)) return;
      setData(d);
      setHistory(h.series || []);
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

  const header = (
    <View style={s.topRow}>
      <View style={s.segment}>
        {([
          ['today', '今天'],
          ['data', '数据'],
        ] as ['today' | 'data', string][]).map(([key, label]) => {
          const active = view === key;
          return (
            <Pressable
              key={key}
              onPress={() => setView(key)}
              style={[s.segItem, active && { backgroundColor: alpha(t.accent, t.dark ? 0.22 : 0.14) }]}
            >
              <Text style={[s.segText, active && { color: t.accent, fontWeight: '600' }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      {view === 'data' ? (
        <Pressable onPress={() => setDataKey((k) => k + 1)} hitSlop={12} style={s.gear}>
          <Text style={[s.gearText, { color: t.accent }]}>⟳</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={() => router.push('/settings')} hitSlop={12} style={s.gear}>
        <Text style={[s.gearText, { color: t.text2 }]}>⚙</Text>
      </Pressable>
    </View>
  );

  // 数据视图不依赖今日状态，独立渲染，避免今日接口加载中把图表页卡住
  if (view === 'data') {
    return (
      <Screen>
        {header}
        <DataView key={dataKey} />
      </Screen>
    );
  }

  if (loading) return <Screen>{header}<Loading /></Screen>;
  if (err && !data)
    return (
      <Screen>
        {header}
        <ErrorBox message={err} onRetry={() => load()} />
      </Screen>
    );
  if (!data) return <Screen>{header}</Screen>;

  const rec = data.recovery || ({} as any);
  const adv = data.recovery_advice || ({} as any);
  const fit = data.fitness || ({} as any);
  const sleepScore = Number(rec.sleep_score) || 0;
  const recColor = recoveryColor(t, sleepScore);
  const hasAnyData = !!(rec.date || data.recent_activities?.length);
  const fitHasData = fit.has_data === true;
  // 疲劳用合并口径：跑步 + 按类型折减的交叉训练；体能仍只算跑步
  const fitAtl = Number(fit.combined_atl ?? fit.atl) || 0;
  const fitTsb = Number(fit.combined_tsb ?? fit.tsb) || 0;
  const cross = fit.cross_training || null;

  /* 长期体能/近期疲劳是负荷点数，没有绝对满分。条本身从 0 量到当前峰值，
   * 浅色带标出近 14 天自己的区间，给数字一个可比的参照。 */
  const rangeFor = (vals: number[], cur: number) => {
    const all = [...vals, cur].filter((v) => Number.isFinite(v));
    const lo = Math.min(...all, 0);
    const hi = Math.max(...all, 1);
    const max = Math.ceil(hi * 1.2 + 1);
    return {
      min: 0,
      max,
      band: { from: Math.max(0, Math.floor(lo)), to: Math.min(max, Math.ceil(hi)) },
    };
  };
  const ctlRange = rangeFor(history.map((p) => p.ctl), Number(fit.ctl) || 0);
  const atlRange = rangeFor(
    history.map((p) => p.combined_atl ?? p.atl),
    fitAtl
  );
  // 0 不是「正常」，无数据时 acwr_ratio 为 null
  const acwr = fit.acwr_ratio === null || fit.acwr_ratio === undefined
    ? null
    : Number(fit.acwr_ratio);
  const acwrColor =
    acwr === null
      ? t.text3
      : acwr > 1.5
        ? t.bad
        : acwr > 1.3 || acwr < 0.8
          ? t.warn
          : t.good;
  const one = (v: number) => F.num(v, 1);
  const two = (v: number) => F.num(v, 2);

  const stages = [
    { label: '深睡', value: Number(rec.deep_minutes) || 0, color: '#5E5CE6' },
    { label: '浅睡', value: Number(rec.light_minutes) || 0, color: '#64D2FF' },
    { label: '快速眼动', value: Number(rec.rem_minutes) || 0, color: '#BF5AF2' },
    { label: '清醒', value: Number(rec.awake_minutes) || 0, color: t.text3 },
  ];
  const hasStages = stages.some((x) => x.value > 0);
  const asleepSum = stages[0].value + stages[1].value + stages[2].value;
  // 分期来自设备、总时长可能来自另一个源；差太多时不画构成环，避免比例误导
  const stageMismatch =
    hasStages &&
    rec.sleep_minutes != null &&
    Math.abs(asleepSum - Number(rec.sleep_minutes)) > 30;
  // 环心只有 88px，用「7h06」这种短格式，别把「7小时6分」塞进去撑破
  const sleepCenter = rec.sleep_minutes
    ? `${Math.floor(rec.sleep_minutes / 60)}h${String(Math.round(rec.sleep_minutes % 60)).padStart(2, '0')}`
    : '–';
  const stageLegend = (arr: typeof stages) =>
    arr.map((x) => ({ color: x.color, label: x.label, value: `${Math.round(x.value)} 分` }));

  const has = (v: any) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  const metrics = [
    has(rec.hrv) ? { label: '心率变异', value: `${F.num(rec.hrv, 0)} 毫秒` } : null,
    has(rec.hrv_status)
      ? { label: '心率变异状态', value: HRV_STATUS_ZH[String(rec.hrv_status)] || String(rec.hrv_status) }
      : null,
    has(rec.body_battery) ? { label: '身体电量（日间峰值）', value: `${F.num(rec.body_battery, 0)}%` } : null,
    has(rec.resting_hr) ? { label: '静息心率', value: `${F.num(rec.resting_hr, 0)} 次/分` } : null,
    has(rec.night_hr) ? { label: '夜间心率', value: `${F.num(rec.night_hr, 0)} 次/分` } : null,
    has(rec.readiness_score) ? { label: '训练准备度', value: F.num(rec.readiness_score, 0) } : null,
    has(rec.recovery_time_min) ? { label: '恢复时间', value: F.duration(rec.recovery_time_min) } : null,
    has(rec.acute_load) ? { label: '佳明急性负荷（厂商算法）', value: F.num(rec.acute_load, 0) } : null,
    has(rec.vo2max) ? { label: '最大摄氧量', value: F.num(rec.vo2max, 1) } : null,
    has(rec.stress_avg) ? { label: '日间压力', value: F.num(rec.stress_avg, 0) } : null,
    has(rec.sleep_stress_avg) ? { label: '睡眠压力', value: F.num(rec.sleep_stress_avg, 0) } : null,
    has(rec.sleep_efficiency) ? { label: '睡眠效率', value: `${F.num(rec.sleep_efficiency, 0)}%` } : null,
    has(rec.spo2_avg) ? { label: '夜间血氧', value: `${F.num(rec.spo2_avg, 0)}%` } : null,
    has(rec.awake_count) ? { label: '清醒次数', value: `${F.num(rec.awake_count, 0)} 次` } : null,
    has(rec.sleep_latency_min) ? { label: '入睡耗时', value: `${F.num(rec.sleep_latency_min, 0)} 分` } : null,
    has(rec.temp_deviation) ? { label: '体温偏移', value: `${F.num(rec.temp_deviation, 1)} °C` } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <Screen refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }}>
      {header}

      {!hasAnyData ? (
        <Card>
          <Text style={[s.emptyTitle, { color: t.text }]}>先把数据接上</Text>
          <Text style={[s.emptyBody, { color: t.text2 }]}>
            完善个人资料并连接数据源，这里会显示每天的恢复状态和训练建议。
          </Text>
          <View style={{ height: S.md }} />
          <Btn title="完善个人资料" onPress={() => router.push('/profile')} primary />
          <View style={{ height: S.sm }} />
          <Btn title="连接数据源" onPress={() => router.push('/sources')} />
        </Card>
      ) : null}

      {/* ---------- 体能状态：首屏主卡 ---------- */}
      {hasAnyData && fitHasData ? (
        <Card>
          <View style={s.cardTop}>
            <Text style={[s.eyebrow, { color: t.text2 }]}>体能状态</Text>
            <Text style={[s.cardDate, { color: t.text3 }]}>近 14 天</Text>
          </View>

          <Gauge
            value={fitTsb}
            min={-30}
            max={30}
            height={162}
            color={tsbColor(t, fitTsb)}
            caption="状态值 · 跑步体能 − 合并疲劳"
            format={(v) => `${v > 0 ? '+' : ''}${F.num(v, 1)}`}
            zones={[
              { from: -30, to: -10, color: t.bad },
              { from: -10, to: 0, color: t.warn },
              { from: 0, to: 10, color: t.good },
              { from: 10, to: 30, color: t.accent },
            ]}
          />

          <Bullet
            label="长期体能（42 天）"
            value={Number(fit.ctl) || 0}
            min={ctlRange.min}
            max={ctlRange.max}
            band={ctlRange.band}
            color={t.accent}
            format={one}
          />
          <Bullet
            label="近期疲劳（7 天，含交叉）"
            value={fitAtl}
            min={atlRange.min}
            max={atlRange.max}
            band={atlRange.band}
            color={t.warn}
            format={one}
          />
          {acwr === null ? (
            <Text style={[s.foot, { color: t.text3 }]}>
              急慢性负荷比：暂无数据（至少需要一次跑步）
            </Text>
          ) : (
            <Bullet
              label="跑步负荷比（7 天 / 42 天）"
              value={acwr}
              min={0}
              max={2}
              band={{ from: 0.8, to: 1.3 }}
              color={acwrColor}
              format={two}
            />
          )}

          {cross && cross.sessions_7d > 0 ? (
            <Text style={[s.foot, { color: t.text2 }]}>
              交叉训练 {cross.sessions_7d} 次 · {F.num(cross.minutes_7d, 0)} 分钟，折算疲劳{' '}
              {F.num(cross.atl, 1)}
              {cross.srpe_sessions_7d > 0 ? ` · ${cross.srpe_sessions_7d} 次按 RPE` : ''}
            </Text>
          ) : null}
          <Text style={[s.foot, { color: t.text3 }]}>本周跑量 {F.num(fit.weekly_km, 1)} 公里</Text>
          <Fold label="指标定义">
            <Text style={s.def}>
              状态值 = 跑步体能 − 合并疲劳（跑步 + 交叉训练）；浅色带是近 14 天你自己的区间。
            </Text>
            <Text style={s.def}>
              长期体能按 42 天算跑步负荷；近期疲劳按 7 天算跑步，再叠加按类型折减的交叉训练。
            </Text>
            <Text style={s.def}>
              跑步负荷比只含跑步：近期跑步疲劳 ÷ 长期跑步体能，参考 0.8–1.3。交叉训练计入疲劳，但不计入跑步体能。
            </Text>
            <Text style={s.def}>
              交叉训练只计入有心率的记录，并按类型折减：骑行 0.6、游泳 0.5、力量 0.35。力量课心率会低估真实负荷，所以权重更低。
            </Text>
          </Fold>
        </Card>
      ) : null}

      {hasAnyData && !fitHasData ? (
        <Card>
          <Text style={[s.emptyBody, { color: t.text2 }]}>
            {cross && cross.sessions_7d > 0
              ? `还没有跑步负荷数据；近 7 天有 ${cross.sessions_7d} 次交叉训练，但只有跑步才计入体能。`
              : '还没有跑步负荷数据。同步几次跑步后，这里会显示长期体能、近期疲劳和跑步负荷比。'}
          </Text>
        </Card>
      ) : null}

      {/* ---------- 恢复：评分环 + 睡眠分期扇形环 ---------- */}
      <Card>
        <View style={s.cardTop}>
          <Text style={[s.eyebrow, { color: t.text2 }]}>恢复</Text>
          <Text style={[s.cardDate, { color: t.text3 }]}>
            {rec.stale
              ? `最近 ${rec.date}${rec.days_ago ? `（${rec.days_ago} 天前）` : ''}`
              : rec.date || F.today()}
          </Text>
        </View>

        {hasStages ? (
          <View style={s.ringRow}>
            <Donut
              value={sleepScore}
              max={100}
              size={112}
              color={sleepScore ? recColor : t.text3}
              caption="睡眠评分"
              format={() => (sleepScore ? String(Math.round(sleepScore)) : '–')}
            />
            {stageMismatch ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[s.heroNum, { color: t.text }]}>{sleepCenter}</Text>
                <Text style={[s.heroNote, { color: t.text2 }]}>睡眠时长</Text>
                <Text
                  style={{
                    color: t.text3,
                    fontSize: T.caption,
                    textAlign: 'center',
                    marginTop: 4,
                    lineHeight: 18,
                  }}
                >
                  分期合计 {Math.round(asleepSum)} 分，与总时长不一致，暂不显示构成
                </Text>
              </View>
            ) : (
              <SegmentRing
                size={112}
                center={sleepCenter}
                caption="睡眠时长"
                segments={stages.map((x) => ({ value: x.value, color: x.color, label: x.label }))}
              />
            )}
          </View>
        ) : (
          <View style={s.heroRow}>
            <Text style={[s.heroNum, { color: sleepScore ? recColor : t.text3 }]}>
              {sleepScore ? F.num(sleepScore) : '–'}
            </Text>
            <Text style={[s.heroNote, { color: t.text2 }]}>睡眠评分</Text>
          </View>
        )}

        {hasStages && !stageMismatch ? (
          <View style={s.legendRow}>
            <RingLegend items={stageLegend(stages.slice(0, 2))} />
            <RingLegend items={stageLegend(stages.slice(2, 4))} />
          </View>
        ) : null}

        {metrics.length ? (
          <Fold label={`更多指标（${metrics.length}）`}>
            <View style={s.metricGrid}>
              {metrics.map((m) => (
                <View key={m.label} style={s.metricCell}>
                  <Text style={s.metricLabel}>{m.label}</Text>
                  <Text style={s.metricValue}>{m.value}</Text>
                </View>
              ))}
            </View>
          </Fold>
        ) : null}
      </Card>

      {/* ---------- 今日建议（规则版） ---------- */}
      {adv.advice ? (
        <Card tint={adv.level ? levelColor(t, adv.level) : undefined}>
          <View style={s.cardTop}>
            <Text style={[s.eyebrow, { color: t.text2 }]}>今天怎么练</Text>
            {adv.level !== undefined && adv.level !== null ? (
              <Pill
                text={['数据不足', '休息', '轻松', '按计划', '可加量'][adv.level] || ''}
                color={levelColor(t, adv.level)}
              />
            ) : null}
          </View>
          <Text style={[s.adviceText, { color: levelColor(t, adv.level) }]}>{adv.advice}</Text>
          {adv.reason ? <Text style={[s.adviceReason, { color: t.text2 }]}>{adv.reason}</Text> : null}
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
    gap: S.sm,
    paddingTop: S.xs,
    paddingBottom: S.md,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    padding: 3,
    borderRadius: R.pill,
    backgroundColor: t.cardInner,
  },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: R.pill },
  segText: { color: t.text2, fontSize: T.body, fontWeight: '500' },
  gear: { paddingHorizontal: 4, paddingVertical: 4 },
  gearText: { fontSize: 20 },

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
  ringRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginTop: S.sm },
  legendRow: { flexDirection: 'row', gap: S.lg, marginTop: S.md },
  chartTitle: { fontSize: T.caption, marginTop: S.md, marginBottom: S.xs },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  metricCell: { width: '50%', paddingVertical: 7, paddingRight: S.md },
  metricLabel: { color: t.text3, fontSize: T.caption },
  metricValue: { color: t.text, fontSize: T.body2, fontWeight: '500', marginTop: 2, ...TNUM },

  adviceText: { fontSize: 22, fontWeight: '600', letterSpacing: -0.5, lineHeight: 30 },
  adviceReason: { fontSize: T.body2, lineHeight: 21, marginTop: S.sm - 2 },
  foot: { fontSize: T.caption, marginTop: S.sm, lineHeight: 20 },
  def: { color: t.text2, fontSize: T.caption, lineHeight: 21, marginBottom: 4 },
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
