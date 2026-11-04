import React from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { api, StatusResp, RecentActivity } from '../../../src/api';
import { Screen, Card, Section, Stat, Row, Btn, Loading, ErrorBox, Empty, Pill } from '../../../src/ui';
import { Sparkline } from '../../../src/charts';
import { C, S, levelColor, tsbColor } from '../../../src/theme';
import { F } from '../../../src/format';
import { ACTIVITY_TYPE, zh } from '../../../src/labels';

export default function TodayScreen() {
  const router = useRouter();
  const [data, setData] = React.useState<StatusResp | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [syncing, setSyncing] = React.useState<string | null>(null);
  const [advice, setAdvice] = React.useState<string | null>(null);
  const [adviceLoading, setAdviceLoading] = React.useState(false);

  const load = React.useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const d = await api.get<StatusResp>('/api/status');
      setData(d);
      setErr(null);
    } catch (e: any) {
      if (!quiet) setErr(e?.message || '加载失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const onSync = async (all = false) => {
    setSyncing(all ? '全量' : '增量');
    try {
      await api.post(all ? '/api/sync-all' : '/api/sync', {}, 300000);
      await load(true);
      Alert.alert('同步完成', all ? '已拉取全部历史数据' : '已同步最新训练与恢复数据');
    } catch (e: any) {
      Alert.alert('同步失败', e?.message || '未知错误');
    } finally {
      setSyncing(null);
    }
  };

  const onUpload = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      const file = res.assets[0];
      setSyncing('上传');
      const out = await api.upload('/api/upload-fit', file.uri, file.name, 'application/octet-stream');
      if (out?.success) {
        Alert.alert(
          '解析成功',
          `${out.activity?.distance_km ?? '-'} 公里 · ${out.activity?.avg_pace ?? '-'} · 心率 ${out.activity?.avg_hr ?? '-'}`
        );
        await load(true);
      } else {
        Alert.alert('解析失败', out?.error || '未知错误');
      }
    } catch (e: any) {
      Alert.alert('上传失败', e?.message || '未知错误');
    } finally {
      setSyncing(null);
    }
  };

  const loadAdvice = async () => {
    setAdviceLoading(true);
    try {
      const d = await api.get<{ advice: string }>('/api/daily-advice');
      setAdvice(d.advice);
    } catch (e: any) {
      setAdvice('加载失败：' + (e?.message || ''));
    } finally {
      setAdviceLoading(false);
    }
  };

  if (loading) return <Loading />;
  if (err && !data) return <Screen><ErrorBox message={err} onRetry={() => load()} /></Screen>;
  if (!data) return null;

  const rec = data.recovery || ({} as any);
  const adv = data.recovery_advice || ({} as any);
  const fit = data.fitness || ({} as any);

  return (
    <Screen refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }}>
      {/* 恢复状态 */}
      <Card>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>恢复状态</Text>
          <Text style={styles.dateText}>{rec.date || F.today()}</Text>
        </View>
        <View style={styles.statRow}>
          <Stat label="睡眠评分" value={F.num(rec.sleep_score)} />
          <Stat label="心率变异性" value={F.num(rec.hrv)} unit="毫秒" />
          <Stat
            label="身体电量"
            value={rec.body_battery ? `${Math.round(rec.body_battery)}%` : '-'}
            color={
              Number(rec.body_battery) > 70 ? C.good : Number(rec.body_battery) > 40 ? C.warn : C.bad
            }
          />
        </View>
        <View style={styles.statRow}>
          <Stat label="静息心率" value={F.num(rec.resting_hr)} unit="次/分" />
          <Stat label="压力均值" value={F.num(rec.stress_avg)} />
          <Stat label="睡眠时长" value={rec.sleep_minutes ? F.duration(rec.sleep_minutes) : '-'} />
        </View>
      </Card>

      {/* 今日建议 */}
      <Card style={{ borderColor: levelColor(adv.level) + '55' }}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>今日建议</Text>
          {adv.level ? <Pill text={['休息', '轻松', '按计划', '可加量'][adv.level - 1] || ''} color={levelColor(adv.level)} /> : null}
        </View>
        <Text style={{ color: levelColor(adv.level), fontSize: 17, fontWeight: '600', marginBottom: 4 }}>
          {adv.advice || '-'}
        </Text>
        <Text style={{ color: C.text2, fontSize: 12, lineHeight: 18 }}>{adv.reason || ''}</Text>
        {adv.hrv_normal_range ? (
          <Text style={{ color: C.text3, fontSize: 11, marginTop: 6 }}>
            心率变异周均 {F.num(adv.hrv_week_avg, 1)}（正常区间 {adv.hrv_normal_range[0]}–{adv.hrv_normal_range[1]}，偏离度 {F.num(adv.z_score, 2)}）
          </Text>
        ) : null}
      </Card>

      {/* 体能状态 */}
      <Card>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>体能状态</Text>
          <Pill text={fit.status || '-'} color={tsbColor(fit.tsb || 0)} />
        </View>
        <View style={styles.statRow}>
          <Stat label="体能储备" value={F.num(fit.ctl, 1)} />
          <Stat label="近期疲劳" value={F.num(fit.atl, 1)} />
          <Stat label="当前状态" value={F.num(fit.tsb, 1)} color={tsbColor(fit.tsb || 0)} />
        </View>
        <View style={styles.statRow}>
          <Stat label="本周跑量" value={F.num(fit.weekly_km, 1)} unit="公里" />
          <Stat label="负荷比" value={F.num(fit.acwr_ratio, 2)} color={fit.acwr_ratio > 1.5 ? C.bad : fit.acwr_ratio > 1.3 ? C.warn : C.good} />
        </View>
      </Card>

      {/* 最近训练 */}
      <Section title="最近训练" right={<Btn title="全部" small onPress={() => router.push('/activities')} />}>
        {data.recent_activities?.length ? (
          <Card style={{ padding: 0 }}>
            {data.recent_activities.map((a, i) => (
              <ActivityRow key={i} a={a} last={i === data.recent_activities.length - 1} />
            ))}
          </Card>
        ) : (
          <Empty text="暂无训练记录，上传 .fit 文件或同步佳明" />
        )}
      </Section>

      {/* 操作 */}
      <Section title="数据">
        <View style={{ flexDirection: 'row', gap: S.sm, flexWrap: 'wrap' }}>
          <Btn title={syncing === '增量' ? '同步中…' : '同步佳明'} onPress={() => onSync(false)} disabled={!!syncing} />
          <Btn title={syncing === '全量' ? '拉取中…' : '全量历史'} onPress={() => onSync(true)} disabled={!!syncing} />
          <Btn title={syncing === '上传' ? '解析中…' : '上传 .fit'} onPress={onUpload} disabled={!!syncing} color={C.purple} />
        </View>
      </Section>

      {/* AI 今日建议正文 */}
      <Section title="AI 今日训练建议">
        <Card>
          {advice ? (
            <Text style={{ color: C.text2, fontSize: 13, lineHeight: 21 }}>{advice}</Text>
          ) : (
            <View style={{ alignItems: 'flex-start' }}>
              <Text style={{ color: C.text3, fontSize: 12, marginBottom: S.sm }}>
                结合恢复数据、体能与计划生成今天的训练安排
              </Text>
              <Btn title={adviceLoading ? '生成中…' : '生成今日建议'} onPress={loadAdvice} disabled={adviceLoading} small />
            </View>
          )}
        </Card>
      </Section>
    </Screen>
  );
}

function ActivityRow({ a, last }: { a: RecentActivity; last: boolean }) {
  return (
    <View style={[styles.actRow, last && { borderBottomWidth: 0 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.actDate}>
          {F.dayShort(a.date)} · {zh(ACTIVITY_TYPE, a.type, '运动')}
        </Text>
        <Text style={styles.actMeta}>
          {F.num(a.distance_km, 2)} 公里 · {a.avg_pace} · 心率 {F.num(a.avg_hr)}
        </Text>
      </View>
      {a.notes ? (
        <Text style={styles.actNotes} numberOfLines={1}>
          {a.notes}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.sm },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: '600' },
  dateText: { color: C.text3, fontSize: 11 },
  statRow: { flexDirection: 'row', gap: S.sm },
  actRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: S.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  actDate: { color: C.text, fontSize: 13, fontWeight: '500' },
  actMeta: { color: C.text3, fontSize: 12, marginTop: 2 },
  actNotes: { color: C.text3, fontSize: 11, maxWidth: 110, textAlign: 'right' },
});
