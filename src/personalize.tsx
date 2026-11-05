/* PB 来源徽标 —— 训练页 / 比赛页共用
 *
 * 后端不再因为「5 公里成绩没填」把整页锁死：
 *   /api/training-plan、/api/race/pacing 都带 pb（来源 / 是否校准）
 * 课表和配速完全由公式按用户真实数据生成，不经过大模型。
 */
import React from 'react';
import { View, Text, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from './api';
import { Card, Btn, Fold } from './ui';
import { S, T, type Theme } from './theme';
import { useTheme } from './theme-provider';

export interface PbMeta {
  minutes: number;
  text: string;
  source: string;
  source_label: string;
  estimated: boolean;
  calibrated: boolean;
  detail: string;
}

/** 把 5 公里成绩的来龙去脉摆到明面上，给「自动识别 / 手动填写」两个入口 */
export function PbBadge({ pb }: { pb?: PbMeta | null }) {
  const t: Theme = useTheme();
  const router = useRouter();
  const [cur, setCur] = React.useState<PbMeta | null>(pb ?? null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => setCur(pb ?? null), [pb]);
  if (!cur) return null;

  const auto = async () => {
    setBusy(true);
    try {
      const r = await api.post<any>('/api/profile/five-k/auto', {});
      if (!r.ok) {
        Alert.alert('没找到可用记录', r.reason || '先同步佳明，或手动填一次');
        return;
      }
      setCur(r.pb);
      Alert.alert('识别成功', `${r.pb.text}（${r.pb.detail}）\n切走再回来，配速会按新成绩重算。`);
    } catch (e: any) {
      Alert.alert('识别失败', e?.message || '稍后再试');
    } finally {
      setBusy(false);
    }
  };

  const ok = cur.calibrated !== false;
  return (
    <Card>
      <Text style={{ color: ok ? t.good : t.warn, fontWeight: '600', fontSize: T.caption + 1 }}>
        {ok ? '✓ 配速已按你的成绩校准' : '⚠ 配速尚未校准'}
      </Text>
      <Text style={{ color: t.text2, fontSize: T.caption, marginTop: 6, lineHeight: 20 }}>
        {ok
          ? `${cur.text} · ${cur.source_label}${cur.estimated ? '（折算）' : ''}`
          : `通用基线 ${cur.text}`}
      </Text>
      {cur.detail ? (
        <Fold label="成绩来源">
          <Text style={{ color: t.text2, fontSize: T.caption, lineHeight: 21 }}>{cur.detail}</Text>
        </Fold>
      ) : null}
      <View style={{ flexDirection: 'row', gap: S.sm, marginTop: S.sm }}>
        <Btn title={busy ? '识别中…' : '从历史记录识别'} onPress={auto} disabled={busy} small />
        <Btn title="手动填写" onPress={() => router.push('/profile')} small />
      </View>
    </Card>
  );
}
