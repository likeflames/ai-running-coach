import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { api, Activity } from './api';
import { Card, Empty, Pill, Loading } from './ui';
import { S, T, type Theme } from './theme';
import { makeStyles, useTheme } from './theme-provider';
import { F } from './format';
import { ACTIVITY_TYPE, SOURCE, zh } from './labels';

/**
 * 活动列表（原「活动」标签页的内容）
 * 现在嵌在「健康」页最下方，可折叠；点条目进详情。
 */
export function ActivityList({ pageSize = 8 }: { pageSize?: number }) {
  const t = useTheme();
  const s = useStyles();
  const router = useRouter();
  const [items, setItems] = React.useState<Activity[] | null>(null);
  const [total, setTotal] = React.useState(0);
  const [hasMore, setHasMore] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const page = Math.max(20, pageSize);

  // 和「全部活动」页一样，回到这个标签页就重新取：否则同步完数据回来还是旧列表
  useFocusEffect(
    React.useCallback(() => {
      let alive = true;
      (async () => {
        try {
          const d = await api.get<{
            activities: Activity[];
            total?: number;
            has_more?: boolean;
          }>(`/api/activities?limit=${page}&offset=0`);
          if (alive) {
            setItems(d.activities || []);
            setTotal(d.total ?? (d.activities || []).length);
            setHasMore(!!d.has_more);
            setErr(null);
          }
        } catch (e: any) {
          if (alive) setErr(e?.message || '加载失败');
        }
      })();
      return () => {
        alive = false;
      };
    }, [page])
  );

  const loadMore = React.useCallback(async () => {
    if (!items || loadingMore) return;
    setLoadingMore(true);
    try {
      const d = await api.get<{
        activities: Activity[];
        total?: number;
        has_more?: boolean;
      }>(`/api/activities?limit=${page}&offset=${items.length}`);
      const next = d.activities || [];
      setItems((cur) => [...(cur || []), ...next]);
      setTotal(d.total ?? items.length + next.length);
      setHasMore(!!d.has_more);
    } catch (e: any) {
      setErr(e?.message || '加载失败');
    } finally {
      setLoadingMore(false);
    }
  }, [items, loadingMore, page]);

  if (err)
    return (
      <Card tint={t.bad}>
        <Text style={{ color: t.bad, fontSize: T.caption }}>{err}</Text>
      </Card>
    );
  if (!items) return <Loading />;
  if (items.length === 0) return <Empty text="暂无活动记录" />;

  const rest = Math.max(0, total - items.length);

  return (
    <View>
      <Text style={s.hint}>
        共 {total} 条{items.length < total ? ` · 已加载 ${items.length} 条` : ''} · 点开可看速度、心率、海拔
      </Text>
      {items.map((a) => (
        <Pressable key={a.id} onPress={() => router.push(`/activity/${a.id}`)}>
          <Card style={{ marginBottom: S.sm }}>
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={s.title}>
                    {F.dayShort(a.date)} · {zh(ACTIVITY_TYPE, a.type, '运动')}
                  </Text>
                  {a.has_track ? <Pill text="含轨迹" color={t.good} /> : null}
                  {a.source ? <Pill text={zh(SOURCE, a.source, '已记录')} color={t.text3} /> : null}
                </View>
                <Text style={s.meta}>
                  {F.num(a.distance_km, 2)} 公里 · {a.avg_pace} · 心率 {F.num(a.avg_hr)} ·{' '}
                  {F.duration(a.duration_min)}
                </Text>
                {a.notes ? <Text style={s.notes}>{a.notes}</Text> : null}
              </View>
              <Text style={s.arrow}>›</Text>
            </View>
          </Card>
        </Pressable>
      ))}

      {hasMore && rest > 0 ? (
        <Pressable onPress={loadMore} style={s.more} disabled={loadingMore}>
          <Text style={s.moreText}>
            {loadingMore ? '加载中…' : `加载更多（还有 ${rest} 条）`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t: Theme) => ({
  hint: { color: t.text3, fontSize: T.micro + 1, marginBottom: S.sm },
  row: { flexDirection: 'row', alignItems: 'center' },
  title: { color: t.text, fontSize: T.body + 1, fontWeight: '600', letterSpacing: -0.1 },
  meta: { color: t.text3, fontSize: T.caption, marginTop: 5, lineHeight: 19 },
  notes: { color: t.text3, fontSize: T.micro + 1, marginTop: 3 },
  arrow: { color: t.text3, fontSize: 26, marginLeft: S.sm, fontWeight: '300' },
  more: { alignItems: 'center', paddingVertical: S.md },
  moreText: { color: t.accent, fontSize: T.caption, fontWeight: '500' },
}));
