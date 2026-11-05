import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api, WeeklyReport, Fitness } from '../api';
import { Card, CardHead, Section, Row, Loading, ErrorBox, Empty, Stat, Fold } from '../ui';
import { Bars, Heatmap, LineChart, Legend } from '../charts';
import { ActivityList } from '../activityList';
import { S, T, tsbColor, type Theme } from '../theme';
import { makeStyles, useTheme } from '../theme-provider';
import { F } from '../format';

interface FitnessPoint {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
  weekly_km: number;
}

/**
 * build 15：全 App 唯一放趋势图的地方。
 * 今日页只留仪表和参照条，计划页只留补给参照条，体能/疲劳折线只在这里画一次。
 * 比赛页原来的「负荷预测折线」改成这里的「计划负荷柱状图」，不再重复画两条线。
 * 本组件不含 Screen，由 app/data.tsx 提供滚动容器。
 */
export default function DataView() {
  const t = useTheme();
  const s = useStyles();
  const [report, setReport] = React.useState<WeeklyReport | null>(null);
  const [history, setHistory] = React.useState<FitnessPoint[]>([]);
  const [trend, setTrend] = React.useState<{ week: string; km: number }[]>([]);
  const [yearKm, setYearKm] = React.useState<{ year: number; days: Record<string, number> } | null>(null);
  const [forecast, setForecast] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [showActivities, setShowActivities] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [r, h, tr, y, f] = await Promise.all([
        api.get<WeeklyReport>('/api/weekly-report'),
        api.get<{ series: FitnessPoint[] }>('/api/fitness/history?days=45'),
        api.get<{ series: { week: string; km: number }[] }>('/api/training/weekly-trend?weeks=8'),
        api.get<{ year: number; days: Record<string, number> }>('/api/training/year-km'),
        api.get('/api/load-forecast?race_days=70').catch(() => null),
      ]);
      setReport(r);
      setHistory(h.series || []);
      setTrend(tr.series || []);
      setYearKm(y);
      setForecast(f);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(React.useCallback(() => { load(); }, [load]));

  if (loading) return <Loading />;
  if (err && !report) return <ErrorBox message={err} onRetry={load} />;
  if (!report) return null;

  const fit: Fitness = report.fitness;
  const yearTotal = yearKm ? Object.values(yearKm.days || {}).reduce((a, b) => a + b, 0) : 0;
  const fc: any[] = forecast?.series || [];
  const weeklyLoad: { label: string; v: number }[] = [];
  for (let i = 0; i < fc.length; i += 7) {
    const part = fc.slice(i, i + 7);
    weeklyLoad.push({
      label: F.dayShort(part[0].date),
      v: part.reduce((a: number, p: any) => a + (Number(p.load) || 0), 0),
    });
  }

  return (
    <>
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
      </Card>

      <Section title="本周恢复均值">
        <Card>
          <View style={s.statRow}>
            <Stat label="心率变异" value={F.num(report.recovery.avg_hrv, 0)} unit="毫秒" />
            <Stat label="睡眠评分" value={F.num(report.recovery.avg_sleep, 0)} />
            <Stat label="身体电量" value={`${F.num(report.recovery.avg_body_battery, 0)}%`} />
          </View>
        </Card>
      </Section>

      <Section title="体能趋势" desc="近 45 天">
        <Card>
          <CardHead title="长期体能 与 近期疲劳" sub={`体能 ${F.num(fit.ctl, 1)} · 疲劳 ${F.num(fit.atl, 1)}`} />
          <LineChart
            height={150}
            labels={history.map((p) => F.dayShort(p.date))}
            series={[
              { values: history.map((p) => p.ctl), color: t.accent, label: '长期体能', area: true },
              { values: history.map((p) => p.atl), color: t.warn, label: '近期疲劳' },
            ]}
          />
          <Legend
            items={[
              { color: t.accent, label: '长期体能 · 42 天指数平均' },
              { color: t.warn, label: '近期疲劳 · 7 天指数平均' },
            ]}
          />
        </Card>

        <Card style={{ marginTop: S.sm }}>
          <CardHead
            title="状态值（体能 − 疲劳）"
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
            series={[{ values: history.map((p) => p.tsb), color: t.purple, label: '状态值', area: true }]}
          />
          <Fold label="指标定义">
            <Text style={s.def}>状态值 = 长期体能 − 近期疲劳。绿色带为 −10 ~ +10。</Text>
          </Fold>
        </Card>
      </Section>

      <Section title="周跑量" desc="近 8 周">
        <Card>
          <Bars values={trend.map((x) => x.km)} labels={trend.map((x) => F.dayShort(x.week))} height={120} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: S.sm }}>
            <Text style={s.meta}>近 8 周最高 {F.num(Math.max(...trend.map((x) => x.km), 0), 1)} 公里</Text>
            <Text style={s.meta}>本周 {F.num(fit.weekly_km, 1)} 公里</Text>
          </View>
        </Card>
      </Section>

      <Section title={`${yearKm?.year || new Date().getFullYear()} 年跑量 · ${F.num(yearTotal, 0)} 公里`}>
        <Card>
          {yearKm ? <Heatmap days={yearKm.days || {}} weeks={26} /> : <Empty text="暂无数据" />}
          <Text style={[s.meta, { marginTop: S.sm }]}>颜色越亮跑量越大 · 每列一周</Text>
        </Card>
      </Section>

      {forecast?.available && weeklyLoad.length ? (
        <Section title="到比赛日的计划负荷">
          <Card>
            <View style={s.statRow}>
              <Stat label="距比赛" value={forecast.days_until_race} unit="天" />
              <Stat
                label="比赛日状态值"
                value={F.num(forecast.race_day?.form, 1)}
                color={tsbColor(t, Number(forecast.race_day?.form ?? 0))}
              />
              <Stat label="最高疲劳" value={F.num(forecast.peak_fatigue?.fatigue, 1)} />
            </View>
            <View style={{ height: S.md }} />
            <Bars values={weeklyLoad.map((x) => x.v)} labels={weeklyLoad.map((x) => x.label)} height={110} color={t.purple} highlightLast={false} />
            <Text style={[s.meta, { marginTop: S.sm }]}>每根柱子为一周计划负荷点数</Text>
          </Card>
        </Section>
      ) : null}

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
              <Text style={s.collapsedText}>查看全部活动记录</Text>
              <Text style={s.toggle}>展开 ›</Text>
            </Pressable>
          </Card>
        )}
      </Section>
    </>
  );
}

const useStyles = makeStyles((t: Theme) => ({
  meta: { color: t.text3, fontSize: T.caption, lineHeight: 20 },
  def: { color: t.text2, fontSize: T.caption, lineHeight: 21 },
  statRow: { flexDirection: 'row', gap: S.sm },
  toggle: { color: t.accent, fontSize: T.caption, fontWeight: '500' },
  collapsedRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  collapsedText: { color: t.text3, fontSize: T.caption, flex: 1, lineHeight: 20 },
}));
