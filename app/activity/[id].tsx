import React from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { api } from '../../src/api';
import { Screen, Card, Section, Row, Loading, ErrorBox, Empty, Stat, Pill } from '../../src/ui';
import { Sparkline } from '../../src/charts';
import { S, T, type Theme } from '../../src/theme';
import { makeStyles, useTheme } from '../../src/theme-provider';
import { F } from '../../src/format';
import { ACTIVITY_TYPE, SOURCE, zh } from '../../src/labels';

interface TrackResp {
  available: boolean;
  reason?: string;
  count?: number;
  has_gps?: boolean;
  t?: (number | null)[];
  alt?: (number | null)[];
  hr?: (number | null)[];
  sp?: (number | null)[];
  cad?: (number | null)[];
  tmp?: (number | null)[];
  pwr?: (number | null)[];
  vo?: (number | null)[];
  vr?: (number | null)[];
  st?: (number | null)[];
  sl?: (number | null)[];
}

/** 秒 → 5'32" */
function mmss(sec: number) {
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}'${String(s).padStart(2, '0')}"`;
}

export default function ActivityDetail() {
  const t = useTheme();
  const s = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const nav = useNavigation();
  const [detail, setDetail] = React.useState<any>(null);
  const [track, setTrack] = React.useState<TrackResp | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [d, tr] = await Promise.all([
        api.get(`/api/activity/${id}/details`),
        api.get<TrackResp>(`/api/activity/${id}/track`).catch(() => null),
      ]);
      setDetail(d);
      setTrack(tr);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (detail?.activity) {
      nav.setOptions({
        title: `${F.dayShort(detail.activity.date)} · ${zh(ACTIVITY_TYPE, detail.activity.type, '运动')}`,
      });
    }
  }, [detail, nav]);

  // 速度：后端是米/秒，这里换成公里/小时
  // 注意：所有 hook 必须写在提前 return 之前，否则首屏加载完会报「Rendered more hooks」
  const speedKmh = React.useMemo(() => {
    const raw = (track?.sp || []).filter((v): v is number => typeof v === 'number' && v > 0);
    if (!raw.length) return [];
    // 去掉前 3% 与后 1% 的异常值（起步/掐表时速度会跳到 0 或极高）
    const head = Math.floor(raw.length * 0.03);
    const tail = Math.max(head + 10, Math.floor(raw.length * 0.99));
    return raw.slice(head, tail).map((v) => v * 3.6);
  }, [track]);

  // 每公里分段：来自 .fit 里的 lap 记录，补详情时写进 metrics_json。
  // 注意 fit 的 avg_running_cadence 已经是步/分，avg_cadence 是单脚圈数要 ×2。
  const laps = React.useMemo(() => {
    const raw = (detail?.metrics?.laps || []) as any[];
    const out: { km: number; pace: number; hr: number | null; cad: number | null; asc: number | null }[] = [];
    raw.forEach((l) => {
      const dist = Number(l?.total_distance ?? 0);
      const dur = Number(l?.total_timer_time ?? l?.total_elapsed_time ?? 0);
      if (!(dist > 50) || !(dur > 0)) return;
      const km = dist / 1000;
      const cadence =
        l?.avg_running_cadence != null
          ? Number(l.avg_running_cadence)
          : l?.avg_cadence != null
            ? Number(l.avg_cadence) * 2
            : null;
      out.push({
        km,
        pace: dur / km,
        hr: l?.avg_heart_rate != null ? Number(l.avg_heart_rate) : null,
        cad: cadence,
        asc: l?.total_ascent != null ? Number(l.total_ascent) : null,
      });
    });
    return out;
  }, [detail]);

  if (loading) return <Loading />;  if (err)
    return (
      <Screen noTabBar>
        <ErrorBox message={err} onRetry={load} />
      </Screen>
    );
  if (!detail?.activity)
    return (
      <Screen noTabBar>
        <Empty text="未找到该活动" />
      </Screen>
    );

  const a = detail.activity;
  const typeLabel = zh(ACTIVITY_TYPE, a.type, '运动');

  const hr = (track?.hr || []).filter((v): v is number => typeof v === 'number' && v > 0);
  const alt = (track?.alt || []).filter((v): v is number => typeof v === 'number');
  const cad = (track?.cad || []).filter((v): v is number => typeof v === 'number' && v > 0);
  const pwr = (track?.pwr || []).filter((v): v is number => typeof v === 'number' && v > 0);
  const tmp = (track?.tmp || []).filter((v): v is number => typeof v === 'number');
  const vo = (track?.vo || []).filter((v): v is number => typeof v === 'number' && v > 0);
  const vr = (track?.vr || []).filter((v): v is number => typeof v === 'number' && v > 0);
  const st = (track?.st || []).filter((v): v is number => typeof v === 'number' && v > 0);
  const sl = (track?.sl || []).filter((v): v is number => typeof v === 'number' && v > 0);

  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, v) => a + v, 0) / arr.length : 0);
  const cadAvg = avg(cad);
  const cadMax = cad.length ? Math.max(...cad) : 0;

  // 平均速度用「总距离 ÷ 总时间」，不再对采样点做等权平均
  // （有停顿或采样不均时，等权平均会高于真实平均）
  const summarySpeed =
    a.distance_km > 0 && a.duration_min > 0 ? a.distance_km / (a.duration_min / 60) : 0;
  const spAvg = summarySpeed > 0
    ? summarySpeed
    : speedKmh.length
      ? speedKmh.reduce((acc, v) => acc + v, 0) / speedKmh.length
      : 0;
  const spMax = speedKmh.length ? Math.max(...speedKmh) : 0;
  const hrAvg = hr.length ? hr.reduce((acc, v) => acc + v, 0) / hr.length : 0;
  const hrMax = hr.length ? Math.max(...hr) : 0;
  const altMin = alt.length ? Math.min(...alt) : 0;
  const altMax = alt.length ? Math.max(...alt) : 0;

  // 图表用带 null 的原始序列 + 时间戳：按真实采样时间画 x 轴，
  // 统计量仍用上面过滤后的数组。
  const tAll = (track?.t || []) as (number | null)[];
  const withGaps = (arr: any[] | undefined, keep: (v: number) => boolean) =>
    (arr || []).map((v) => (typeof v === 'number' && keep(v) ? v : null));
  const speedSeries = withGaps(track?.sp, (v) => v > 0).map((v) =>
    v == null ? null : v * 3.6
  );

  return (
    <Screen noTabBar>
      <Card>
        <View style={s.head}>
          <Text style={s.title}>{typeLabel}</Text>
          {a.source ? <Pill text={zh(SOURCE, a.source, '已记录')} color={t.text3} /> : null}
        </View>
        <Text style={s.meta}>
          {F.dateTime(a.date)}
          {a.notes ? ` · ${a.notes}` : ''}
        </Text>
        <View style={[s.statRow, { marginTop: S.md }]}>
          <Stat label="距离" value={F.num(a.distance_km, 2)} unit="公里" big />
          <Stat label="时长" value={F.duration(a.duration_min)} />
          <Stat label="配速" value={a.avg_pace} />
        </View>
        <View style={[s.statRow, { marginTop: S.sm }]}>
          <Stat label="平均心率" value={F.num(a.avg_hr)} unit="次/分" />
          <Stat label="最大心率" value={F.num(a.max_hr)} unit="次/分" />
          <View style={{ flex: 1, minWidth: 72 }} />
        </View>
      </Card>

      {/* 速度 */}
      <Section title="速度">
        <Card>
          {speedKmh.length > 1 ? (
            <>
              <View style={s.sumRow}>
                <Stat label="平均速度（全程）" value={F.num(spAvg, 1)} unit="公里/小时" />
                <Stat label="最高速度" value={F.num(spMax, 1)} unit="公里/小时" color={t.accent} />
              </View>
              <Sparkline
                values={speedSeries}
                times={tAll}
                color={t.accent}
                height={95}
                baseline="auto"
                showRange
                formatValue={(v) => `${v.toFixed(1)}`}
              />
            </>
          ) : (
            <Text style={s.meta}>这次活动没有速度数据</Text>
          )}
        </Card>
      </Section>

      {/* 心率 */}
      <Section title="心率">
        <Card>
          {hr.length > 1 ? (
            <>
              <View style={s.sumRow}>
                <Stat label="平均心率" value={F.num(hrAvg)} unit="次/分" />
                <Stat label="最高心率" value={F.num(hrMax)} unit="次/分" color={t.bad} />
              </View>
              <Sparkline
                values={withGaps(track?.hr, (v) => v > 0)}
                times={tAll}
                color={t.bad}
                height={95}
                baseline="auto"
                showRange
              />
            </>
          ) : (
            <Text style={s.meta}>这次活动没有心率数据</Text>
          )}
        </Card>
      </Section>

      {/* 海拔 */}
      <Section title="海拔">
        <Card>
          {alt.length > 1 ? (
            <>
              <View style={s.sumRow}>
                <Stat label="最低海拔" value={F.num(altMin)} unit="米" />
                <Stat label="最高海拔" value={F.num(altMax)} unit="米" color={t.good} />
                <Stat label="累计爬升" value={F.num(a.ascent_m ?? detail.metrics?.session?.total_ascent)} unit="米" />
              </View>
              <Sparkline
                values={withGaps(track?.alt, () => true)}
                times={tAll}
                color={t.good}
                height={95}
                baseline="auto"
                showRange
              />
            </>
          ) : (
            <Text style={s.meta}>这次活动没有海拔数据</Text>
          )}
        </Card>
      </Section>

      {/* 步频 */}
      <Section title="步频">
        <Card>
          {cad.length > 1 ? (
            <>
              <View style={s.sumRow}>
                <Stat label="平均步频" value={F.num(cadAvg)} unit="步/分" />
                <Stat label="最高步频" value={F.num(cadMax)} unit="步/分" color={t.accent} />
              </View>
              <Sparkline
                values={withGaps(track?.cad, (v) => v > 0)}
                times={tAll}
                color={t.accent}
                height={90}
                baseline="auto"
                showRange
              />
            </>
          ) : (
            <Text style={s.meta}>这次活动没有步频数据</Text>
          )}
        </Card>
      </Section>

      {/* 跑步动态：只有佳明的高阶手表/心率带才有这些字段，有才显示 */}
      {vo.length > 1 || vr.length > 1 || st.length > 1 || sl.length > 1 ? (
        <Section title="跑步动态">
          <Card>
            <View style={s.sumRow}>
              <Stat label="垂直振幅" value={F.num(avg(vo), 1)} unit="毫米" />
              <Stat label="垂直步幅比" value={F.num(avg(vr), 1)} unit="%" />
              <Stat label="触地时间" value={F.num(avg(st))} unit="毫秒" />
            </View>
            <View style={[s.sumRow, { marginBottom: 0 }]}>
              <Stat label="步幅" value={F.num(avg(sl) / 10, 0)} unit="厘米" />
            </View>
          </Card>
        </Section>
      ) : null}

      {/* 功率 / 温度：骑行台、跑步功率计或高温天才有意义 */}
      {pwr.length > 1 || tmp.length > 1 ? (
        <Section title="功率与温度">
          <Card>
            <View style={s.sumRow}>
              {pwr.length > 1 ? <Stat label="平均功率" value={F.num(avg(pwr))} unit="瓦" /> : null}
              {pwr.length > 1 ? <Stat label="最高功率" value={F.num(Math.max(...pwr))} unit="瓦" color={t.accent} /> : null}
              {tmp.length > 1 ? <Stat label="平均温度" value={F.num(avg(tmp), 1)} unit="℃" /> : null}
            </View>
          </Card>
        </Section>
      ) : null}

      {/* 每公里分段 */}
      {laps.length ? (
        <Section title="分段">
          <Card>
            {laps.map((l, i) => (
              <View
                key={i}
                style={[s.lapRow, { borderTopColor: t.border, borderTopWidth: i === 0 ? 0 : 0.5 }]}
              >
                <Text style={[s.lapIdx, { color: t.text3 }]}>{i + 1}</Text>
                <Text style={[s.lapCell, { color: t.text }]}>{F.num(l.km, 2)} km</Text>
                <Text style={[s.lapCell, { color: t.text }]}>{mmss(l.pace)}/km</Text>
                <Text style={[s.lapCell, { color: t.text3 }]}>{l.hr ? `${l.hr} 次/分` : '-'}</Text>
                <Text style={[s.lapCell, { color: t.text3 }]}>
                  {l.asc === null || l.asc === undefined ? '-' : `+${Math.round(l.asc)}m`}
                </Text>
              </View>
            ))}
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles((t: Theme) => ({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: t.text, fontSize: T.title + 2, fontWeight: '600', letterSpacing: -0.3 },
  meta: { color: t.text3, fontSize: T.micro + 1, marginTop: S.xs, lineHeight: 18 },
  statRow: { flexDirection: 'row', gap: S.sm },
  sumRow: { flexDirection: 'row', gap: S.sm, marginBottom: S.sm },
  lapRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  lapIdx: { width: 22, fontSize: T.micro + 1 },
  lapCell: { flex: 1, fontSize: T.caption },
}));
