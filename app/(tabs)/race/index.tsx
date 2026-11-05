import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { PbBadge } from '../../../src/personalize';
import { api } from '../../../src/api';
import { Screen, Card, CardHead, Section, Row, Loading, ErrorBox, Empty, Stat, Pill, Hint, Btn } from '../../../src/ui';
import { Legend, LineChart } from '../../../src/charts';
import { S, T, R, TNUM, alpha, tsbColor, type Theme } from '../../../src/theme';
import { makeStyles, useTheme } from '../../../src/theme-provider';
import { F } from '../../../src/format';
import { SCENARIO, zh } from '../../../src/labels';

const DISTANCES = [
  { key: '10', label: '10 公里', km: 10 },
  { key: '21.1', label: '半马', km: 21.1 },
  { key: '42.2', label: '全马', km: 42.2 },
];

const STRATEGIES = [
  { key: 'even', label: '匀速' },
  { key: 'negative', label: '后程加速' },
  { key: 'positive', label: '前程偏快' },
];

export default function RaceScreen() {
  const t = useTheme();
  const s = useStyles();
  const router = useRouter();
  const [distance, setDistance] = React.useState(21.1);
  const [strategy, setStrategy] = React.useState('even');
  const [pacing, setPacing] = React.useState<any>(null);
  const [nutrition, setNutrition] = React.useState<any>(null);
  const [forecast, setForecast] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [p, n, f] = await Promise.all([
        api.get(`/api/race/pacing?distance_km=${distance}&strategy=${strategy}`),
        api.get(`/api/nutrition/race?distance_km=${distance}&pace_s_km=${Math.round(pacing?.base_pace_s_km || 250)}`),
        api.get('/api/load-forecast?race_days=70'),
      ]);
      setPacing(p);
      setNutrition(n);
      setForecast(f);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [distance, strategy]);

  // 每次切回比赛页都重拉：档案改完返回时，配速和成绩来源要跟着更新。
  // 距离 / 策略变化仍由 load 的依赖变化触发。
  useFocusEffect(React.useCallback(() => { load(); }, [load]));

  /** 预测曲线：后台按天给出，最后一天就是比赛日 */
  const fc: any[] = forecast?.series || [];

  return (
    <Screen>
      <PbBadge pb={pacing?.pb} />

      {/* 距离 / 策略 */}
      <Card>
        <Text style={s.label}>比赛距离</Text>
        <View style={s.chips}>
          {DISTANCES.map((d) => (
            <Chip key={d.key} active={distance === d.km} text={d.label} onPress={() => setDistance(d.km)} />
          ))}
        </View>
        <Text style={[s.label, { marginTop: S.md }]}>配速策略</Text>
        <View style={s.chips}>
          {STRATEGIES.map((st) => (
            <Chip key={st.key} active={strategy === st.key} text={st.label} onPress={() => setStrategy(st.key)} />
          ))}
        </View>
      </Card>

      {loading ? (
        <Loading text="计算中…" />
      ) : err ? (
        <ErrorBox message={err} onRetry={load} />
      ) : (
        <>
          {/* 新用户没填 5 公里成绩时，后端只回一句「缺资料」。
              与其显示「暂无配速数据」让人以为是坏了，不如直接给个入口。 */}
          {/* 配速不再被 5 公里成绩卡住；这里只剩补给需要体重 */}
          {nutrition?.needs_profile ? (
            <Card>
              <CardHead title="补给方案还差一步" />
              <Text style={s.meta}>
                {nutrition.reason || '填一下体重，才能算出比赛日要补多少碳水和电解质'}
              </Text>
              <View style={{ height: S.md }} />
              <Btn title="去填体重" onPress={() => router.push('/profile')} primary small />
            </Card>
          ) : null}

          {/* 目标配速 */}
          {pacing?.available ? (
            <Card>
              <CardHead title="目标配速" right={<Pill text={`跑步能力值 ${F.num(pacing.vdot, 1)}`} />} />
              <Text style={s.bigPace}>{pacing.base_pace_fmt}</Text>
              <Text style={s.meta}>{pacing.strategy_desc}</Text>
              <View style={{ height: S.md }} />
              {pacing.scenarios
                ? Object.entries(pacing.scenarios).map(([k, v]: any) => (
                    <Row
                      key={k}
                      label={zh(SCENARIO, k, '参考方案')}
                      value={`${v.pace_fmt}/公里 · ${F.num(v.total_hours, 2)} 小时`}
                      color={k === 'realistic' ? t.accent : t.text2}
                    />
                  ))
                : null}
            </Card>
          ) : (
            <Empty text="暂无配速数据" />
          )}

          {/* 分段 */}
          {pacing?.splits?.length ? (
            <Section title="分段计划">
              <Card style={{ padding: 0 }}>
                {pacing.splits.map((sp: any, i: number) => (
                  <View
                    key={i}
                    style={[
                      s.split,
                      { borderBottomColor: t.border },
                      i === pacing.splits.length - 1 && { borderBottomWidth: 0 },
                    ]}
                  >
                    <Text style={s.splitIdx}>第{sp.split}段</Text>
                    <Text style={s.splitRange}>
                      {F.num(sp.km_from, 1)}–{F.num(sp.km_to, 1)} 公里
                    </Text>
                    <Text style={s.splitPace}>{sp.pace_fmt}</Text>
                    <Text style={s.splitDelta}>{sp.delta_vs_base}</Text>
                  </View>
                ))}
              </Card>
            </Section>
          ) : null}

          {/* 补给 */}
          {nutrition?.available ? (
            <Section title="比赛补给">
              <Card>
                <Row label="预计用时" value={`${F.num(nutrition.estimated_duration_h, 2)} 小时`} />
                <Row label="碳水" value={`每小时 ${nutrition.carbs.per_hour_g} 克 · 全程 ${F.num(nutrition.carbs.total_race_g, 0)} 克`} />
                <Row label="补水" value={`每小时 ${nutrition.hydration.per_hour_ml} 毫升 · 全程 ${F.num(nutrition.hydration.total_race_ml, 0)} 毫升`} />
                <Row label="电解质" value={`钠 每小时 ${nutrition.electrolytes.per_hour_mg} 毫克`} />
                <Text style={[s.meta, { marginTop: S.md, lineHeight: 20 }]}>
                  {nutrition.carbs.label}
                  {'\n'}
                  {nutrition.carbs.note}
                </Text>
              </Card>
            </Section>
          ) : null}

          {/* 负荷预测 */}
          {forecast?.available ? (
            <Section title="负荷与状态预测">
              <Card>
                <View style={s.statRow}>
                  <Stat label="距比赛" value={forecast.days_until_race} unit="天" />
                  <Stat
                    label="比赛日状态"
                    value={F.num(forecast.race_day?.form, 1)}
                    color={tsbColor(t, Number(forecast.race_day?.form ?? 0))}
                  />
                  <Stat label="最高疲劳" value={F.num(forecast.peak_fatigue?.fatigue, 1)} />
                </View>

                <View style={s.chartHead}>
                  <Text style={s.chartTitle}>体能 / 疲劳走势</Text>
                  <Text style={s.chartSpan}>
                    {fc.length ? `${F.dayShort(fc[0].date)} – ${F.dayShort(fc[fc.length - 1].date)}` : ''}
                  </Text>
                </View>

                <LineChart
                  height={168}
                  yTicks={3}
                  series={[
                    { values: fc.map((p: any) => p.fitness), color: t.accent, label: '体能', area: true },
                    { values: fc.map((p: any) => p.fatigue), color: t.warn, label: '疲劳' },
                  ]}
                  labels={fc.map((p: any) => F.dayShort(p.date))}
                />

                <Legend
                  items={[
                    { color: t.accent, label: '体能 · 长期积累' },
                    { color: t.warn, label: '疲劳 · 短期负担' },
                  ]}
                />

                <Hint label="这张图怎么看">
                  纵轴为负荷点数。体能 42 天、疲劳 7 天指数平均，共用同一刻度。
                </Hint>

                <Text style={[s.meta, { marginTop: S.md, lineHeight: 20 }]}>{forecast.advice}</Text>
                {forecast.peak_fatigue?.date ? (
                  <Text style={[s.meta, { marginTop: 5 }]}>
                    疲劳峰值 {forecast.peak_fatigue.date}
                  </Text>
                ) : null}
              </Card>
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function Chip({ text, active, onPress }: { text: string; active: boolean; onPress: () => void }) {
  const t = useTheme();
  const s = useStyles();
  return (
    <Pressable
      onPress={onPress}
      style={[
        s.chip,
        { backgroundColor: active ? alpha(t.accent, t.dark ? 0.2 : 0.12) : t.cardInner },
        active && { borderColor: t.accent },
      ]}
    >
      <Text style={{ color: active ? t.accent : t.text2, fontSize: T.caption + 1, fontWeight: active ? '600' : '400' }}>
        {text}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((t: Theme) => ({
  label: { color: t.text3, fontSize: T.micro + 1, fontWeight: '500', marginBottom: 8 },
  chips: { flexDirection: 'row', gap: S.sm, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: S.md,
    paddingVertical: 9,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  bigPace: {
    color: t.accent,
    fontSize: 46,
    fontWeight: '600',
    letterSpacing: -1.8,
    marginTop: -2,
    marginBottom: 2,
    ...TNUM,
  },
  meta: { color: t.text3, fontSize: T.micro + 1, lineHeight: 18 },
  chartHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: S.lg,
    marginBottom: S.sm,
  },
  chartTitle: { color: t.text, fontSize: T.body2, fontWeight: '600' },
  chartSpan: { color: t.text3, fontSize: T.micro + 1, ...TNUM },
  statRow: { flexDirection: 'row', gap: S.sm },
  split: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: S.md + 2,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: S.sm,
  },
  splitIdx: { color: t.text3, fontSize: T.micro + 1, width: 40 },
  splitRange: { color: t.text2, fontSize: T.caption, flex: 1 },
  splitPace: { color: t.text, fontSize: T.body, fontWeight: '600', ...TNUM },
  splitDelta: { color: t.text3, fontSize: T.micro + 0.5, minWidth: 46, textAlign: 'right', ...TNUM },
}));
