import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { api, Activity } from '../src/api';
import { Screen, Card, Loading, ErrorBox, Empty, Pill } from '../src/ui';
import { S, T, type Theme } from '../src/theme';
import { makeStyles, useTheme } from '../src/theme-provider';
import { F } from '../src/format';
import { ACTIVITY_TYPE, SOURCE, zh } from '../src/labels';

const PAGE = 50;

export default function AllActivitiesScreen() {
  const t = useTheme();
  const s = useStyles();
  const router = useRouter();
  const [items, setItems] = React.useState<Activity[]>([]);
  const [total, setTotal] = React.useState(0);
  const [hasMore, setHasMore] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const d = await api.get<{
        activities: Activity[];
        total?: number;
        has_more?: boolean;
      }>(`/api/activities?limit=${PAGE}&offset=0`);
      setItems(d.activities || []);
      setTotal(d.total ?? (d.activities || []).length);
      setHasMore(!!d.has_more);
      setErr(null);
    } catch (e: any) {
      if (!quiet) setErr(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = React.useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const d = await api.get<{
        activities: Activity[];
        total?: number;
        has_more?: boolean;
      }>(`/api/activities?limit=${PAGE}&offset=${items.length}`);
      const next = d.activities || [];
      setItems((cur) => [...cur, ...next]);
      setTotal(d.total ?? items.length + next.length);
      setHasMore(!!d.has_more);
    } catch (e: any) {
      setErr(e?.message || '加载失败');
    } finally {
      setLoadingMore(false);
    }
  }, [items.length, loadingMore]);

  /**
   * 每次回到这一页都重新取一次。
   *
   * 用 useEffect 只在挂载时取一次，页面就会被「冻住」：用户去数据源页同步完
   * 再返回，看到的还是同步前那份列表，看起来就像「同步了但历史里没有」。
   * 首次进页面才显示整页 loading，之后静默刷新，避免每次切回来都闪一下。
   */
  const firstFocus = React.useRef(true);
  useFocusEffect(
    React.useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        load();
        return;
      }
      load(true);
    }, [load])
  );

  if (loading) return <Loading />;
  if (err)
    return (
      <Screen noTabBar>
        <ErrorBox message={err} onRetry={load} />
      </Screen>
    );

  return (
    <Screen noTabBar>
      <Text style={s.hint}>
        共 {total} 条活动{items.length < total ? ` · 已加载 ${items.length} 条` : ''}，点开可看速度、心率和海拔
      </Text>
      {items.length === 0 ? (
        <Empty text="暂无活动记录" />
      ) : (
        items.map((a) => (
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
        ))
      )}
      {hasMore ? (
        <Pressable onPress={loadMore} disabled={loadingMore} style={s.more}>
          <Text style={s.moreText}>
            {loadingMore ? '加载中…' : `加载更多（还有 ${Math.max(0, total - items.length)} 条）`}
          </Text>
        </Pressable>
      ) : null}
    </Screen>
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
