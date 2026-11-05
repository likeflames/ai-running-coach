import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api, WeeklyReport, Fitness } from '../../../src/api';
import { Screen, Card, CardHead, Section, Row, Loading, ErrorBox, Empty, Stat, Hint } from '../../../src/ui';
import { Bars, Heatmap, LineChart, Legend } from '../../../src/charts';
import { ActivityList } from '../../../src/activityList';
import { S, T, tsbColor, type Theme } from '../../../src/theme';
import { makeStyles, useTheme } from '../../../src/theme-provider';
import { F } from '../../../src/format';

interface FitnessPoint {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
  weekly_km: number;
}

export default function HealthScreen() {
  const t = useTheme();
  const s = useStyles();
  const [report, setReport] = React.useState<WeeklyReport | null>(null);
  const [history, setHistory] = React.useState<FitnessPoint[]>([]);
  const [trend, setTrend] = React.useState<{ week: string; km: number }[]>([]);
  const [yearKm, setYearKm] = React.useState<{ year: number; days: Record<string, number> } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [showActivities, setShowActivities] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [r, h, tr, y] = await Promise.all([
        api.get<WeeklyReport>('/api/weekly-report'),
        api.get<{ series: FitnessPoint[] }>('/api/fitness/history?days=45'),
        api.get<{ series: { week: string; km: number }[] }>('/api/training/weekly-trend?weeks=8'),
        api.get<{ year: number; days: Record<string, number> }>('/api/training/year-km'),
      ]);
      setReport(r);
      setHistory(h.series || []);
      setTrend(tr.series || []);
      setYearKm(y);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 每次切回这个标签都重新拉一次。
  // 用 useEffect 只在挂载时加载一次，而标签页是常驻的——
  // 同步完数据回来，看到的还是进来时那份旧数据。
  useFocusEffect(
    React.useCallback(() => {
      load();
    }, [load])
  );

  if (loading) return <Loading />;
  if (err && !report)
    return (
      <Screen>
        <ErrorBox message={err} onRetry={load} />
      </Screen>
    );
  if (!report) return null;

  const fit: Fitness = report.fitness;
  const yearTotal = yearKm ? Object.values(yearKm.days || {}).reduce((a, b) => a + b, 0) : 0;

  return (
    <Screen>
      {/* 周报 */}
      <Card>
        <CardHead title="本周报告" sub={`${F.dayShort(report.week_start)}–${F.dayShort(report.week_end)}`} />
        <View style={s.statRow}>
          <Stat label="本周跑量" value={F.num(report.this_week.total_km, 1)} unit="公里" big />
          <Stat label="次数" value={report.this_week.runs} />
          <Stat label="时长" value={`${F.num(report.this_week.duration_hours, 1)}`} unit="小时" />
        </View>
        <View style={{ height: S.sm }} />
        <Row
          label="对比上周"
          value={`${F.signed(report.km_change, 1)} 公里（${F.signed(report.km_change_pct, 0)}%）`}
          color={report.km_change_pct > 20 ? t.warn : t.text}
        />
        <Text style={[s.meta, { marginTop: S.sm, lineHeight: 20 }]}>{report.summary}</Text>
      </Card>

      {/* 恢复均值 */}
      <Section title="本周恢复均值">
        <Card>
          <View style={s.statRow}>
            <Stat label="心率变异" value={F.num(report.recovery.avg_hrv, 0)} unit="毫秒" />
            <Stat label="睡眠评分" value={F.num(report.recovery.avg_sleep, 0)} />
            <Stat label="身体电量" value={`${F.num(report.recovery.avg_body_battery, 0)}%`} />
          </View>
        </Card>
      </Section>

      {/* 体能趋势 */}
      <Section title="体能趋势" desc="近 45 天">
        <Card>
          <CardHead title="体能 与 疲劳" sub={`体能 ${F.num(fit.ctl, 1)} · 疲劳 ${F.num(fit.atl, 1)}`} />
          <LineChart
            height={150}
            labels={history.map((p) => F.dayShort(p.date))}
            series={[
              { values: history.map((p) => p.ctl), color: t.accent, label: '体能（长期底子）', area: true },
              { values: history.map((p) => p.atl), color: t.warn, label: '疲劳（近期压力）' },
            ]}
          />
          <Legend
            items={[
              { color: t.accent, label: '体能 — 长期积累的能力' },
              { color: t.warn, label: '疲劳 — 最近几天的训练压力' },
            ]}
          />
          <Hint label="这两条线怎么看">
            横轴是日期，纵轴是负荷点数，两条线越高代表负担越重。看两条线的相对位置：
            <Text style={{ color: t.accent }}>蓝线在橙线上方</Text>
            ，说明底子在、恢复得过来；<Text style={{ color: t.warn }}>橙线窜到蓝线上方</Text>
            ，就是最近练猛了，容易累出伤。理想状态是蓝线缓慢爬升、橙线在它下面起伏。
          </Hint>
        </Card>

        <Card style={{ marginTop: S.sm }}>
          <CardHead
            title="状态（体能 − 疲劳）"
            right={
              <Text style={{ color: tsbColor(t, fit.tsb), fontSize: T.big, fontWeight: '600', letterSpacing: -0.8 }}>
                {fit.tsb > 0 ? '+' : ''}
                {F.num(fit.tsb, 1)}
              </Text>
            }
          />
          <LineChart
            height={130}
            labels={history.map((p) => F.dayShort(p.date))}
            zeroLine
            band={{ from: -10, to: 10, color: t.good }}
            series={[{ values: history.map((p) => p.tsb), color: t.purple, label: '状态', area: true }]}
          />
          <Hint label="这条线怎么读">
            这条线就是「体能减去疲劳」，可以直接理解成<Text style={{ color: t.text }}>今天身体还剩多少余量</Text>。
            绿色带（−10 ~ +10）是正常训练区间；<Text style={{ color: t.bad }}>掉到 −20 以下</Text>
            说明欠了太多恢复，该减量或休息；<Text style={{ color: t.warn }}>长期高于 +15</Text>
            说明最近太闲，体能会往下掉。比赛日最好安排在 +5 ~ +15 这一段。
          </Hint>
        </Card>
      </Section>

      {/* 周跑量 */}
      <Section title="周跑量" desc="近 8 周">
        <Card>
          <Bars values={trend.map((x) => x.km)} labels={trend.map((x) => F.dayShort(x.week))} height={120} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: S.sm }}>
            <Text style={s.meta}>近 8 周最高 {F.num(Math.max(...trend.map((x) => x.km), 0), 1)} 公里</Text>
            <Text style={s.meta}>本周 {F.num(fit.weekly_km, 1)} 公里</Text>
          </View>
        </Card>
      </Section>

      {/* 年跑量热力图 */}
      <Section title={`${yearKm?.year || new Date().getFullYear()} 年跑量 · ${F.num(yearTotal, 0)} 公里`}>
        <Card>
          {yearKm ? <Heatmap days={yearKm.days || {}} weeks={26} /> : <Empty text="暂无数据" />}
          <Text style={[s.meta, { marginTop: S.sm }]}>颜色越亮跑量越大 · 每列一周</Text>
        </Card>
      </Section>

      {/* 活动记录（原「活动」标签页） */}
      <Section
        title="活动记录"
        right={
          <Pressable onPress={() => setShowActivities((v) => !v)} hitSlop={10}>
            <Text style={s.toggle}>{showActivities ? '收起' : '展开'}</Text>
          </Pressable>
        }
      >
        {showActivities ? (
          <ActivityList />
        ) : (
          <Card>
            <Pressable onPress={() => setShowActivities(true)} style={s.collapsedRow}>
              <Text style={s.collapsedText}>每一次跑步、球类、骑行都在这里，点开看速度、心率、海拔</Text>
              <Text style={s.toggle}>展开 ›</Text>
            </Pressable>
          </Card>
        )}
      </Section>
    </Screen>
  );
}

const useStyles = makeStyles((t: Theme) => ({
  meta: { color: t.text3, fontSize: T.micro + 1, lineHeight: 18 },
  statRow: { flexDirection: 'row', gap: S.sm },
  toggle: { color: t.accent, fontSize: T.caption, fontWeight: '500' },
  collapsedRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  collapsedText: { color: t.text3, fontSize: T.caption, flex: 1, lineHeight: 20 },
}));
