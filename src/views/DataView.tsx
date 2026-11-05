import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api, WeeklyReport, Fitness } from '../api';
import { Card, CardHead, Section, Row, Loading, ErrorBox, Empty, Stat, Fold } from '../ui';
import { Bars, Heatmap, LineChart, Legend } from '../charts';
import { S, T, tsbColor, type Theme } from '../theme';
import { makeStyles, useTheme } from '../theme-provider';
import { F } from '../format';

interface FitnessPoint {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
  combined_atl?: number;
  combined_tsb?: number;
  weekly_km: number;
  has_data?: boolean;
}

interface TrendPoint {
  week: string;
  km: number;
  partial?: boolean;
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
  const [trend, setTrend] = React.useState<TrendPoint[]>([]);
  const [yearKm, setYearKm] = React.useState<{
    year: number;
    days: Record<string, number>;
    total_km?: number;
  } | null>(null);
  const [forecast, setForecast] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [r, h, tr, y, f] = await Promise.all([
        api.get<WeeklyReport>('/api/weekly-report'),
        api.get<{ series: FitnessPoint[] }>('/api/fitness/history?days=45'),
        api.get<{ series: TrendPoint[] }>('/api/training/weekly-trend?weeks=8'),
        api.get<{ year: number; days: Record<string, number>; total_km?: number }>('/api/training/year-km'),
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
  // 疲劳/状态用合并口径（跑步 + 折算后的交叉训练），体能仍是跑步 CTL
  const fitFatigue = fit.combined_atl ?? fit.atl;
  const fitForm = fit.combined_tsb ?? fit.tsb;
  const cross = fit.cross_training || null;
  const yearTotal = yearKm
    ? yearKm.total_km ?? Object.values(yearKm.days || {}).reduce((a, b) => a + b, 0)
    : 0;
  // 用后端按自然周切好的块；旧接口没有 weekly 时才退回「从今天起每 7 天」
  const fc: any[] = forecast?.series || [];
  let weeklyLoad: { label: string; v: number; partial?: boolean }[] = [];
  if (forecast?.weekly?.length) {
    weeklyLoad = forecast.weekly.map((w: any) => ({
      label: F.dayShort(w.week_start),
      v: Number(w.load) || 0,
      partial: !!w.partial,
    }));
  } else {
    for (let i = 0; i < fc.length; i += 7) {
      const part = fc.slice(i, i + 7);
      weeklyLoad.push({
        label: F.dayShort(part[0].date),
        v: part.reduce((a: number, p: any) => a + (Number(p.load) || 0), 0),
      });
    }
  }
  // 只画到本周：用接口给的日期算周数，避免在渲染里调用 Date.now()/new Date()
  const dayOfYear = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    const cum = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return (cum[m - 1] || 0) + d + (leap && m > 2 ? 1 : 0);
  };
  const yearRef = report.counted_through || report.week_end;
  const yearWeeks = yearKm
    ? Math.max(1, Math.min(53, Math.ceil((dayOfYear(yearRef) + 6) / 7) + 1))
    : 26;

  return (
    <>
      <Card>
        <CardHead
          title="本周报告"
          sub={
            report.partial
              ? `截至 ${F.dayShort(report.counted_through)} · 本周未结束`
              : `${F.dayShort(report.week_start)}–${F.dayShort(report.week_end)}`
          }
        />
        <View style={s.statRow}>
          <Stat label="本周跑量" value={F.num(report.this_week.total_km, 1)} unit="公里" big />
          <Stat label="次数" value={report.this_week.runs} />
          <Stat label="时长" value={`${F.num(report.this_week.duration_hours, 1)}`} unit="小时" />
        </View>
        {report.this_week.easy_km + report.this_week.interval_km +
          report.this_week.long_km + report.this_week.other_km > 0 ? (
          <Text style={[s.meta, { marginTop: S.sm }]}>
            轻松 {F.num(report.this_week.easy_km, 1)} · 强度 {F.num(report.this_week.interval_km, 1)} ·
            长距离 {F.num(report.this_week.long_km, 1)} · 其他 {F.num(report.this_week.other_km, 1)} 公里
          </Text>
        ) : null}
        <View style={{ height: S.sm }} />
        <Row
          label={report.partial ? '对比上周同期' : '对比上周'}
          value={
            report.km_change_pct === null || report.km_change_pct === undefined
              ? `${F.signed(report.km_change, 1)} 公里（上周无数据）`
              : `${F.signed(report.km_change, 1)} 公里（${F.signed(report.km_change_pct, 0)}%）`
          }
          color={
            report.km_change_pct !== null && Number(report.km_change_pct) > 20 ? t.warn : t.text
          }
        />
      </Card>

      <Section title="本周恢复均值">
        <Card>
          <View style={s.statRow}>
            <Stat
              label="心率变异"
              value={report.recovery.avg_hrv === null ? '—' : F.num(report.recovery.avg_hrv, 0)}
              unit="毫秒"
            />
            <Stat
              label="睡眠评分"
              value={report.recovery.avg_sleep === null ? '—' : F.num(report.recovery.avg_sleep, 0)}
            />
            <Stat
              label="身体电量"
              value={
                report.recovery.avg_body_battery === null
                  ? '—'
                  : `${F.num(report.recovery.avg_body_battery, 0)}%`
              }
            />
          </View>
          {report.recovery.samples &&
          !report.recovery.samples.hrv &&
          !report.recovery.samples.sleep ? (
            <Text style={[s.meta, { marginTop: S.sm }]}>本周还没有恢复数据</Text>
          ) : null}
        </Card>
      </Section>

      <Section title="体能趋势" desc="近 45 天">
        {!fit.has_data ? (
          <Card>
            <Empty
              text={
                cross && cross.sessions_7d > 0
                  ? `还没有跑步负荷数据；近 7 天有 ${cross.sessions_7d} 次交叉训练，但只有跑步才计入体能。`
                  : '还没有跑步负荷数据，先同步几次跑步再来'
              }
            />
          </Card>
        ) : (
          <>
            <Card>
              <CardHead
                title="长期体能 与 近期疲劳"
                sub={`体能 ${F.num(fit.ctl, 1)} · 疲劳 ${F.num(fitFatigue, 1)}`}
              />
              <LineChart
                height={150}
                labels={history.map((p) => F.dayShort(p.date))}
                series={[
                  {
                    values: history.map((p) => (p.has_data === false ? null : p.ctl)),
                    color: t.accent,
                    label: '长期体能',
                    area: true,
                  },
                  {
                    values: history.map((p) =>
                      p.has_data === false ? null : p.combined_atl ?? p.atl
                    ),
                    color: t.warn,
                    label: '近期疲劳',
                  },
                ]}
              />
              <Legend
                items={[
                  { color: t.accent, label: '长期体能 · 42 天指数平均（跑步）' },
                  { color: t.warn, label: '近期疲劳 · 7 天指数平均（含交叉训练）' },
                ]}
              />
              {cross && cross.sessions_7d > 0 ? (
                <Text style={[s.meta, { marginTop: S.xs }]}>
                  近 7 天交叉训练 {cross.sessions_7d} 次 · {F.num(cross.minutes_7d, 0)} 分钟，
                  折算疲劳 {F.num(cross.atl, 1)}
                  {cross.srpe_sessions_7d > 0 ? ` · ${cross.srpe_sessions_7d} 次按 RPE` : ''}
                </Text>
              ) : null}
              {fit.load_model ? (
                <Text style={[s.meta, { marginTop: S.xs }]}>
                  负荷模型：静息心率 {F.num(fit.load_model.resting_hr, 0)} · 最大心率{' '}
                  {F.num(fit.load_model.max_hr, 0)}（
                  {fit.load_model.resting_hr_source === 'profile'
                    ? '档案'
                    : fit.load_model.resting_hr_source === 'observed'
                      ? '观测值'
                      : '默认值'}
                  ）
                </Text>
              ) : null}
            </Card>

            <Card style={{ marginTop: S.sm }}>
              <CardHead
                title="状态值（跑步体能 − 合并疲劳）"
                right={
                  <Text
                    style={{
                      color: tsbColor(t, fitForm),
                      fontSize: T.big,
                      fontWeight: '600',
                      letterSpacing: -0.8,
                    }}
                  >
                    {fitForm > 0 ? '+' : ''}
                    {F.num(fitForm, 1)}
                  </Text>
                }
              />
              <LineChart
                height={130}
                labels={history.map((p) => F.dayShort(p.date))}
                zeroLine
                band={{ from: -10, to: 10, color: t.good }}
                series={[
                  {
                    values: history.map((p) =>
                      p.has_data === false ? null : p.combined_tsb ?? p.tsb
                    ),
                    color: t.purple,
                    label: '状态值',
                    area: true,
                  },
                ]}
              />
              <Fold label="指标定义">
                <Text style={s.def}>
                  状态值 = 跑步体能 − 合并疲劳（跑步 + 按类型折减的交叉训练）。参考带 −10 ~ +10：
                  低于 −10 疲劳偏高，−10 ~ 0 为正常训练疲劳，0 ~ +10 状态较好，+10
                  以上通常意味着近期减量或休息较多。
                </Text>
              </Fold>
            </Card>
          </>
        )}
      </Section>

      <Section title="周跑量" desc="近 8 周">
        <Card>
          <Bars
            values={trend.map((x) => x.km)}
            labels={trend.map((x) => F.dayShort(x.week))}
            partial={trend.map((x) => !!x.partial)}
            height={120}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: S.sm }}>
            <Text style={s.meta}>近 8 周最高 {F.num(Math.max(...trend.map((x) => x.km), 0), 1)} 公里</Text>
            <Text style={s.meta}>本周 {F.num(fit.weekly_km, 1)} 公里</Text>
          </View>
        </Card>
      </Section>

      <Section title={`${yearKm?.year || new Date().getFullYear()} 年跑量 · ${F.num(yearTotal, 0)} 公里`}>
        <Card>
          {yearKm ? (
            <Heatmap days={yearKm.days || {}} weeks={yearWeeks} />
          ) : (
            <Empty text="暂无数据" />
          )}
          <Text style={[s.meta, { marginTop: S.sm }]}>
            颜色越亮跑量越大 · 每列一周 · 只画到本周
          </Text>
        </Card>
      </Section>

      {forecast?.available && weeklyLoad.length ? (
        <Section title="到比赛日的计划负荷">
          <Card>
            <View style={s.statRow}>
              <Stat label="距比赛" value={forecast.days_until_race} unit="天" />
              <Stat
                label="比赛日状态值（赛前）"
                value={F.num(forecast.race_day?.form, 1)}
                color={tsbColor(t, Number(forecast.race_day?.form ?? 0))}
              />
              <Stat label="最高疲劳" value={F.num(forecast.peak_fatigue?.fatigue, 1)} />
            </View>
            <View style={{ height: S.md }} />
            <Bars
              values={weeklyLoad.map((x) => x.v)}
              labels={weeklyLoad.map((x) => x.label)}
              partial={weeklyLoad.map((x) => !!x.partial)}
              height={110}
              color={t.purple}
              highlightLast={false}
            />
            <Text style={[s.meta, { marginTop: S.sm }]}>
              每根柱子为一周计划负荷（与长期体能/近期疲劳同一单位）；空心为未完成周
            </Text>
          </Card>
        </Section>
      ) : null}
    </>
  );
}

const useStyles = makeStyles((t: Theme) => ({
  meta: { color: t.text3, fontSize: T.caption, lineHeight: 20 },
  def: { color: t.text2, fontSize: T.caption, lineHeight: 21 },
  statRow: { flexDirection: 'row', gap: S.sm },
}));
