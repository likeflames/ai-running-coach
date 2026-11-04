import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { api, Activity } from './api';
import { Card, Empty, Pill, Loading } from './ui';
import { C, S } from './theme';
import { F } from './format';
import { ACTIVITY_TYPE, SOURCE, zh } from './labels';

/**
 * 活动列表（原「活动」标签页的内容）
 * 现在嵌在「健康」页最下方，可折叠；点条目进详情。
 */
export function ActivityList({ pageSize = 8 }: { pageSize?: number }) {
  const router = useRouter();
  const [items, setItems] = React.useState<Activity[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [shown, setShown] = React.useState(pageSize);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await api.get<{ activities: Activity[] }>('/api/activities');
        if (alive) setItems(d.activities || []);
      } catch (e: any) {
        if (alive) setErr(e?.message || '加载失败');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (err) return <Card><Text style={{ color: C.bad, fontSize: 12 }}>{err}</Text></Card>;
  if (!items) return <Loading />;
  if (items.length === 0) return <Empty text="暂无活动记录" />;

  const visible = items.slice(0, shown);
  const rest = items.length - visible.length;

  return (
    <View>
      <Text style={styles.hint}>共 {items.length} 条 · 点开可看速度、心率、海拔</Text>
      {visible.map((a) => (
        <Pressable key={a.id} onPress={() => router.push(`/activity/${a.id}`)}>
          <Card style={{ marginBottom: S.sm }}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.title}>
                    {F.dayShort(a.date)} · {zh(ACTIVITY_TYPE, a.type, '运动')}
                  </Text>
                  {a.has_track ? <Pill text="有详细数据" color={C.good} /> : null}
                  {a.source ? <Pill text={zh(SOURCE, a.source, '已记录')} color={C.text3} /> : null}
                </View>
                <Text style={styles.meta}>
                  {F.num(a.distance_km, 2)} 公里 · {a.avg_pace} · 心率 {F.num(a.avg_hr)} ·{' '}
                  {F.duration(a.duration_min)}
                </Text>
                {a.notes ? <Text style={styles.notes}>{a.notes}</Text> : null}
              </View>
              <Text style={styles.arrow}>›</Text>
            </View>
          </Card>
        </Pressable>
      ))}

      {rest > 0 ? (
        <Pressable onPress={() => setShown((n) => n + pageSize)} style={styles.more}>
          <Text style={styles.moreText}>再看 {Math.min(pageSize, rest)} 条（还有 {rest} 条）</Text>
        </Pressable>
      ) : items.length > pageSize ? (
        <Pressable onPress={() => setShown(pageSize)} style={styles.more}>
          <Text style={styles.moreText}>收起，只看最近 {pageSize} 条</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { color: C.text3, fontSize: 11, marginBottom: S.sm },
  row: { flexDirection: 'row', alignItems: 'center' },
  title: { color: C.text, fontSize: 14, fontWeight: '600' },
  meta: { color: C.text3, fontSize: 12, marginTop: 4 },
  notes: { color: C.text3, fontSize: 11, marginTop: 2 },
  arrow: { color: C.text3, fontSize: 22, marginLeft: 8 },
  more: { alignItems: 'center', paddingVertical: 10 },
  moreText: { color: C.accent, fontSize: 12 },
});
