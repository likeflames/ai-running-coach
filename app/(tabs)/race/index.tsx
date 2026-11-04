import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { api } from '../../../src/api';
import { Screen, Card, Section, Row, Loading, ErrorBox, Empty, Stat, Pill, Btn } from '../../../src/ui';
import { Sparkline } from '../../../src/charts';
import { C, S } from '../../../src/theme';
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

  React.useEffect(() => {
    load();
    // 仅随距离/策略变化重新计算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distance, strategy]);

  return (
    <Screen>
      {/* 距离 / 策略 */}
      <Card>
        <Text style={styles.label}>比赛距离</Text>
        <View style={styles.chips}>
          {DISTANCES.map((d) => (
            <Chip key={d.key} active={distance === d.km} text={d.label} onPress={() => setDistance(d.km)} />
          ))}
        </View>
        <Text style={[styles.label, { marginTop: S.md }]}>配速策略</Text>
        <View style={styles.chips}>
          {STRATEGIES.map((s) => (
            <Chip key={s.key} active={strategy === s.key} text={s.label} onPress={() => setStrategy(s.key)} />
          ))}
        </View>
      </Card>

      {loading ? (
        <Loading text="计算中…" />
      ) : err ? (
        <ErrorBox message={err} onRetry={load} />
      ) : (
        <>
          {/* 目标配速 */}
          {pacing?.available ? (
            <Card>
              <View style={styles.head}>
                <Text style={styles.cardTitle}>目标配速</Text>
                <Pill text={`跑步能力值 ${F.num(pacing.vdot, 1)}`} />
              </View>
              <Text style={styles.bigPace}>{pacing.base_pace_fmt}</Text>
              <Text style={styles.meta}>{pacing.strategy_desc}</Text>
              <View style={{ height: S.md }} />
              {pacing.scenarios
                ? Object.entries(pacing.scenarios).map(([k, v]: any) => (
                    <Row
                      key={k}
                      label={zh(SCENARIO, k, '参考方案')}
                      value={`${v.pace_fmt}/公里 · ${F.num(v.total_hours, 2)} 小时`}
                      color={k === 'realistic' ? C.accent : C.text2}
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
                  <View key={i} style={[styles.split, i === pacing.splits.length - 1 && { borderBottomWidth: 0 }]}>
                    <Text style={styles.splitIdx}>第{sp.split}段</Text>
                    <Text style={styles.splitRange}>
                      {F.num(sp.km_from, 1)}–{F.num(sp.km_to, 1)} 公里
                    </Text>
                    <Text style={styles.splitPace}>{sp.pace_fmt}</Text>
                    <Text style={styles.meta}>{sp.delta_vs_base}</Text>
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
                <Text style={[styles.meta, { marginTop: S.sm, lineHeight: 18 }]}>
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
                <View style={styles.statRow}>
                  <Stat label="距比赛" value={forecast.days_until_race} unit="天" />
                  <Stat label="比赛日状态" value={F.num(forecast.race_day?.form, 1)} />
                  <Stat label="最高疲劳" value={F.num(forecast.peak_fatigue?.fatigue, 1)} />
                </View>
                <Text style={[styles.meta, { marginBottom: 4, marginTop: S.sm }]}>体能 / 疲劳走势</Text>
                <Sparkline values={(forecast.series || []).map((p: any) => p.fitness)} color={C.accent} height={80} />
                <View style={{ height: S.sm }} />
                <Sparkline values={(forecast.series || []).map((p: any) => p.fatigue)} color={C.warn} height={60} area={false} />
                <Text style={[styles.meta, { marginTop: S.sm, lineHeight: 18 }]}>{forecast.advice}</Text>
                <Text style={[styles.meta, { marginTop: 4 }]}>{forecast.model_note}</Text>
              </Card>
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function Chip({ text, active, onPress }: { text: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        active && { backgroundColor: C.accent + '22', borderColor: C.accent },
      ]}
    >
      <Text style={{ color: active ? C.accent : C.text2, fontSize: 13, fontWeight: active ? '600' : '400' }}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.sm },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: '600' },
  label: { color: C.text3, fontSize: 11, marginBottom: 6 },
  chips: { flexDirection: 'row', gap: S.sm, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.cardInner,
  },
  bigPace: { color: C.accent, fontSize: 34, fontWeight: '700' },
  meta: { color: C.text3, fontSize: 11 },
  statRow: { flexDirection: 'row', gap: S.sm },
  split: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: S.md,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
    gap: 8,
  },
  splitIdx: { color: C.text3, fontSize: 11, width: 26 },
  splitRange: { color: C.text2, fontSize: 12, flex: 1 },
  splitPace: { color: C.text, fontSize: 13, fontWeight: '600' },
});
