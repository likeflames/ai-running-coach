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
  alt?: (number | null)[];
  hr?: (number | null)[];
  sp?: (number | null)[];
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
    return raw.slice(head, tail).map((v) => Math.min(v * 3.6, 30));
  }, [track]);

  if (loading) return <Loading />;
  if (err)
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

  const spAvg = speedKmh.length ? speedKmh.reduce((acc, v) => acc + v, 0) / speedKmh.length : 0;
  const spMax = speedKmh.length ? Math.max(...speedKmh) : 0;
  const hrAvg = hr.length ? hr.reduce((acc, v) => acc + v, 0) / hr.length : 0;
  const hrMax = hr.length ? Math.max(...hr) : 0;
  const altMin = alt.length ? Math.min(...alt) : 0;
  const altMax = alt.length ? Math.max(...alt) : 0;

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
                <Stat label="平均速度" value={F.num(spAvg, 1)} unit="公里/小时" />
                <Stat label="最高速度" value={F.num(spMax, 1)} unit="公里/小时" color={t.accent} />
              </View>
              <Sparkline values={speedKmh} color={t.accent} height={95} />
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
              <Sparkline values={hr} color={t.bad} height={95} />
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
              <Sparkline values={alt} color={t.good} height={95} />
            </>
          ) : (
            <Text style={s.meta}>这次活动没有海拔数据</Text>
          )}
        </Card>
      </Section>
    </Screen>
  );
}

const useStyles = makeStyles((t: Theme) => ({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: t.text, fontSize: T.title + 2, fontWeight: '600', letterSpacing: -0.3 },
  meta: { color: t.text3, fontSize: T.micro + 1, marginTop: S.xs, lineHeight: 18 },
  statRow: { flexDirection: 'row', gap: S.sm },
  sumRow: { flexDirection: 'row', gap: S.sm, marginBottom: S.sm },
}));
