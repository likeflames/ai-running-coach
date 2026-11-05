import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { PbBadge } from '../personalize';
import { api } from '../api';
import { Card, CardHead, Section, Row, Loading, ErrorBox, Stat, Pill, Fold, Btn } from '../ui';
import { Bullet } from '../charts';
import { S, T, R, TNUM, alpha, type Theme } from '../theme';
import { makeStyles, useTheme } from '../theme-provider';
import { F } from '../format';
import { SCENARIO, zh } from '../labels';

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

/**
 * build 15：比赛页只保留配速、分段、补给三块。
 * 负荷预测折线移到 /data 统一展示，不再和今日/数据页重复画线。
 * 补给依赖本轮算出的真实配速（旧版拿上一次 render 的 pacing，会算错时长）。
 * 本组件不含 Screen，由 app/(tabs)/plan/index.tsx 统一提供滚动容器。
 */
export default function RaceView({ reloadKey = 0 }: { reloadKey?: number }) {
  const t = useTheme();
  const s = useStyles();
  const router = useRouter();
  const [distance, setDistance] = React.useState(21.1);
  const [strategy, setStrategy] = React.useState('even');
  const [pacing, setPacing] = React.useState<any>(null);
  const [nutrition, setNutrition] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const p: any = await api.get(`/api/race/pacing?distance_km=${distance}&strategy=${strategy}`);
      // 先拿配速，再按时长算补给；并行 + 旧 pacing 会让 10 公里按上一档全马配速算。
      const n: any = await api.get(
        `/api/nutrition/race?distance_km=${distance}&pace_s_km=${Math.round(p?.base_pace_s_km || 300)}`
      );
      setPacing(p);
      setNutrition(n);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [distance, strategy]);

  useFocusEffect(React.useCallback(() => { load(); }, [load]));
  React.useEffect(() => { if (reloadKey) load(); }, [reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const carbs = nutrition?.carbs;
  const fluid = nutrition?.hydration;
  const salt = nutrition?.electrolytes;

  return (
    <>
      <PbBadge pb={pacing?.pb} />

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
          {nutrition?.needs_profile ? (
            <Card>
              <CardHead title="补给方案还差一步" />
              <Text style={s.meta}>{nutrition.reason || '填一下体重，才能算补给量'}</Text>
              <View style={{ height: S.md }} />
              <Btn title="去填体重" onPress={() => router.push('/profile')} primary small />
            </Card>
          ) : null}

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
          ) : null}

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

          {nutrition?.available ? (
            <Section title="比赛补给">
              <Card>
                <View style={s.statRow}>
                  <Stat label="预计用时" value={F.num(nutrition.estimated_duration_h, 2)} unit="小时" big />
                  <Stat label="赛中碳水" value={F.num(carbs.total_race_g, 0)} unit="克" />
                </View>
                <Bullet
                  label="碳水 · 克/小时"
                  value={Number(carbs.per_hour_g) || 0}
                  min={0}
                  max={100}
                  band={carbs.band || { from: 30, to: 90 }}
                  color={t.accent}
                  format={(v) => `${F.num(v, 0)}`}
                />
                <Bullet
                  label="补水 · 毫升/小时"
                  value={Number(fluid.per_hour_ml) || 0}
                  min={0}
                  max={1000}
                  band={fluid.band || { from: 400, to: 800 }}
                  color="#64D2FF"
                  format={(v) => `${F.num(v, 0)}`}
                />
                <Bullet
                  label="钠 · 毫克/小时"
                  value={Number(salt.per_hour_mg) || 0}
                  min={0}
                  max={900}
                  band={salt.band || { from: 300, to: 700 }}
                  color={t.purple}
                  format={(v) => `${F.num(v, 0)}`}
                />
                <View style={{ height: S.md }} />
                <Row label="赛前" value={`${F.num(nutrition.pre_race?.carb_load_g_per_day, 0)} 克/天 · ${nutrition.pre_race?.days ?? 1} 天`} />
                <Row label="开赛前 1 小时" value={`${F.num(nutrition.pre_race?.last_hour_g, 0)} 克碳水`} />
                <Row label="赛后 1 小时" value={`${F.num(nutrition.post_race?.carb_g, 0)} 克碳水 + ${F.num(nutrition.post_race?.protein_g, 0)} 克蛋白质`} />
                <Fold label="计算依据">
                  <View style={s.basisList}>
                    {Object.entries(nutrition.basis || {}).map(([k, v]) => (
                      <Text key={k} style={s.basisLine}>{String(v)}</Text>
                    ))}
                    <Text style={s.basisLine}>{carbs.label}</Text>
                  </View>
                </Fold>
              </Card>
            </Section>
          ) : null}

          {pacing?.basis ? (
            <Section title="计算依据">
              <Card>
                {Object.entries(pacing.basis).map(([k, v]) => (
                  <Text key={k} style={s.basisLine}>{String(v)}</Text>
                ))}
              </Card>
            </Section>
          ) : null}
        </>
      )}
    </>
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
  label: { color: t.text3, fontSize: T.caption, fontWeight: '500', marginBottom: 8 },
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
  meta: { color: t.text3, fontSize: T.caption, lineHeight: 20 },
  statRow: { flexDirection: 'row', gap: S.sm },
  split: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: S.md + 2,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: S.sm,
  },
  splitRange: { color: t.text2, fontSize: T.body, flex: 1 },
  splitPace: { color: t.text, fontSize: T.body + 1, fontWeight: '600', ...TNUM },
  splitDelta: { color: t.text3, fontSize: T.caption, minWidth: 52, textAlign: 'right', ...TNUM },
  basisList: { gap: 4 },
  basisLine: { color: t.text2, fontSize: T.caption, lineHeight: 21 },
}));
