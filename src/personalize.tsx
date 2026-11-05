/* PB 来源徽标 + 大模型个性化卡片 —— 训练页 / 比赛页共用
 *
 * 后端不再因为「5 公里成绩没填」把整页锁死：
 *   /api/training-plan、/api/race/pacing 带 pb（来源 / 是否校准）
 *   /api/personalize?scope=training|race 给结合近期跑量、恢复、目标的解读
 * 大模型只出文字建议，不改写任何配速和跑量数字。
 */
import React from 'react';
import { View, Text, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { api } from './api';
import { Card, CardHead, Btn } from './ui';
import { S, type Theme } from './theme';
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

interface Personalization {
  engine: string;
  summary: string;
  notes: string[];
  cautions: string[];
  degraded_reason?: string;
  basis?: {
    pb_text: string;
    pb_source: string;
    avg_4w_km: number;
    acwr: number;
    calibrated: boolean;
  };
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
      <Text style={{ color: ok ? t.good : t.warn, fontWeight: '600', fontSize: 13 }}>
        {ok ? '✓ 配速已按你的成绩校准' : '⚠ 配速尚未校准'}
      </Text>
      <Text style={{ color: t.text2, fontSize: 12, marginTop: 6, lineHeight: 18 }}>
        {ok
          ? `${cur.text} · ${cur.source_label}${cur.estimated ? '（折算）' : ''}${cur.detail ? ' · ' + cur.detail : ''}`
          : `暂用通用基线 ${cur.text} 排课 · ${cur.detail}`}
      </Text>
      <View style={{ flexDirection: 'row', gap: S.sm, marginTop: 10 }}>
        <Btn title={busy ? '识别中…' : '从历史记录识别'} onPress={auto} disabled={busy} small />
        <Btn title="手动填写" onPress={() => router.push('/profile')} small />
      </View>
    </Card>
  );
}

/** 异步加载个性化解读；读不出来就不显示，绝不挡住主课表 */
export function PersonalizationCard({ scope }: { scope: 'training' | 'race' }) {
  const t: Theme = useTheme();
  const [data, setData] = React.useState<Personalization | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      let alive = true;
      api.get<Personalization>(`/api/personalize?scope=${scope}`)
        .then((d) => { if (alive) setData(d); })
        .catch(() => { if (alive) setData(null); });
      return () => { alive = false; };
    }, [scope]),
  );

  if (!data) return null;
  const engine = data.engine === 'llm' ? 'AI 教练' : '规则建议';
  const b = data.basis ?? {
    pb_text: '', pb_source: '', avg_4w_km: 0, acwr: 1, calibrated: false,
  };

  return (
    <Card>
      <CardHead title="✨ 针对你的调整建议" />
      <Text style={{ color: t.text3, fontSize: 11, marginBottom: 6 }}>
        {engine}{data.degraded_reason ? `（${data.degraded_reason}，已自动切换）` : ''}
      </Text>
      <Text style={{ color: t.text, fontSize: 13, lineHeight: 19 }}>{data.summary}</Text>
      {(data.notes || []).map((n, i) => (
        <Text key={i} style={{ color: t.text2, fontSize: 12, lineHeight: 18, marginTop: 6 }}>
          • {n}
        </Text>
      ))}
      {(data.cautions || []).map((n, i) => (
        <Text key={i} style={{ color: t.warn, fontSize: 12, lineHeight: 18, marginTop: 6 }}>
          ⚠ {n}
        </Text>
      ))}
      <Text style={{ color: t.text3, fontSize: 11, marginTop: 10, lineHeight: 16 }}>
        依据：{b.pb_text || ''} · {b.pb_source || ''} · 近 4 周均量 {b.avg_4w_km ?? 0} km · 负荷比 {b.acwr ?? 1}
      </Text>
    </Card>
  );
}
