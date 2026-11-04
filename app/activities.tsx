import React from 'react';
import { View, Text, StyleSheet, Pressable, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { api, Activity } from '../src/api';
import { Screen, Card, Loading, ErrorBox, Empty, Pill } from '../src/ui';
import { C, S } from '../src/theme';
import { F } from '../src/format';
import { ACTIVITY_TYPE, SOURCE, zh } from '../src/labels';

export default function MapsScreen() {
  const router = useRouter();
  const [items, setItems] = React.useState<Activity[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<{ activities: Activity[] }>('/api/activities');
      setItems(d.activities || []);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Loading />;
  if (err) return <Screen noTabBar><ErrorBox message={err} onRetry={load} /></Screen>;

  return (
    <Screen noTabBar>
      <Text style={styles.hint}>共 {items.length} 条活动，点开可看速度、心率和海拔</Text>
      {items.length === 0 ? (
        <Empty text="暂无活动记录" />
      ) : (
        items.map((a) => (
          <Pressable key={a.id} onPress={() => router.push(`/activity/${a.id}`)}>
            <Card style={{ marginBottom: S.sm }}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.title}>
                      {F.dayShort(a.date)} · {zh(ACTIVITY_TYPE, a.type, '运动')}
                    </Text>
                    {a.has_track ? <Pill text="有详细数据" color={C.good} /> : null}
                    {a.source ? <Pill text={zh(SOURCE, a.source, "已记录")} color={C.text3} /> : null}
                  </View>
                  <Text style={styles.meta}>
                    {F.num(a.distance_km, 2)} 公里 · {a.avg_pace} · 心率 {F.num(a.avg_hr)} · {F.duration(a.duration_min)}
                  </Text>
                  {a.notes ? <Text style={styles.notes}>{a.notes}</Text> : null}
                </View>
                <Text style={styles.arrow}>›</Text>
              </View>
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: { color: C.text3, fontSize: 11, marginBottom: S.sm },
  row: { flexDirection: 'row', alignItems: 'center' },
  title: { color: C.text, fontSize: 14, fontWeight: '600' },
  meta: { color: C.text3, fontSize: 12, marginTop: 4 },
  notes: { color: C.text3, fontSize: 11, marginTop: 2 },
  arrow: { color: C.text3, fontSize: 22, marginLeft: 8 },
});
