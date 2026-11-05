import React from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../src/api';
import { Screen, Section, Card, Btn } from '../src/ui';
import { S, T, type Theme } from '../src/theme';
import { makeStyles, useTheme } from '../src/theme-provider';

interface Profile {
  athlete_name: string;
  goal: string;
  weekly_days: string;
  five_k_pb_min: string;
  weight_kg: string;
  race_date: string;
  race_distance_km: string;
  resting_hr: string;
  max_hr: string;
  sex: string;
}

/** 分数字符串 → "23:30" 这种好读的格式 */
function pbText(v: string) {
  const n = parseFloat(v);
  if (!v || !isFinite(n)) return '';
  const m = Math.floor(n);
  const s = Math.round((n - m) * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** "23:30" / "23.5" → 分钟数 */
function parsePb(text: string): string | null {
  const s = text.trim();
  if (!s) return '';
  const m = s.match(/^(\d{1,2})\s*[:'′]\s*(\d{1,2})?$/);
  if (m) {
    const mm = Number(m[1]);
    const ss = Number(m[2] || 0);
    if (ss >= 60) return null;
    return (mm + ss / 60).toFixed(2);
  }
  const n = Number(s);
  if (!isFinite(n)) return null;
  return n.toFixed(2);
}

export default function ProfileScreen() {
  const t = useTheme();
  const s = useStyles();
  const router = useRouter();

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState('');
  const [f, setF] = React.useState<Profile>({
    athlete_name: '',
    goal: '',
    weekly_days: '4',
    five_k_pb_min: '',
    weight_kg: '',
    race_date: '',
    race_distance_km: '',
    resting_hr: '',
    max_hr: '',
    sex: '',
  });

  React.useEffect(() => {
    api
      .get<{ profile: Profile }>('/api/profile')
      .then((r) => {
        setF({
          athlete_name: r.profile.athlete_name || '',
          goal: r.profile.goal || '',
          weekly_days: r.profile.weekly_days || '4',
          five_k_pb_min: r.profile.five_k_pb_min || '',
          weight_kg: r.profile.weight_kg || '',
          race_date: r.profile.race_date || '',
          race_distance_km: r.profile.race_distance_km || '',
          resting_hr: r.profile.resting_hr || '',
          max_hr: r.profile.max_hr || '',
          sex: r.profile.sex || '',
        });
      })
      .catch((e: any) => setErr(e?.message || '读取失败'))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setErr('');
    const pb = parsePb(f.five_k_pb_min);
    if (pb === null) return setErr('5 公里成绩填成 23:30 这样的格式');
    const days = Number(f.weekly_days || 4);
    if (!Number.isFinite(days) || days < 1 || days > 7) return setErr('每周训练天数填 1–7');
    const rd = f.race_distance_km.trim();
    if (rd && (!Number.isFinite(Number(rd)) || Number(rd) < 1 || Number(rd) > 200)) {
      return setErr('目标比赛距离填 1–200 之间的公里数，例如 21.1');
    }
    const rhr = f.resting_hr.trim();
    if (rhr && (!Number.isFinite(Number(rhr)) || Number(rhr) < 30 || Number(rhr) > 100)) {
      return setErr('静息心率填 30–100 之间的整数');
    }
    const mhr = f.max_hr.trim();
    if (mhr && (!Number.isFinite(Number(mhr)) || Number(mhr) < 120 || Number(mhr) > 230)) {
      return setErr('最大心率填 120–230 之间的整数');
    }

    setSaving(true);
    try {
      await api.put('/api/profile', {
        athlete_name: f.athlete_name.trim(),
        goal: f.goal.trim(),
        weekly_days: String(Math.round(days)),
        five_k_pb_min: pb,
        weight_kg: f.weight_kg.trim(),
        race_date: f.race_date.trim(),
        race_distance_km: rd,
        resting_hr: rhr,
        max_hr: mhr,
        sex: f.sex.trim(),
      });
      Alert.alert('已保存', '训练配速和计划会按你的成绩重新计算。', [
        { text: '好', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      setErr(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[s.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator color={t.text2} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: S.xl }}>
        <Section title="你的情况" desc="这些数字决定配速区间，填错会练错">
          <Card>
            <Field label="称呼" value={f.athlete_name} onChange={(v) => setF({ ...f, athlete_name: v })} placeholder="怎么称呼你" />
            <Field label="目标" value={f.goal} onChange={(v) => setF({ ...f, goal: v })} placeholder="例如：半马破 1:45 / 健康跑" />
            <Field
              label="5 公里最好成绩"
              value={f.five_k_pb_min}
              onChange={(v) => setF({ ...f, five_k_pb_min: v })}
              placeholder="23:30"
              keyboard="numbers-and-punctuation"
              hint="格式 分:秒；留空可从已同步活动自动识别。"
            />
            <Field
              label="每周能练几天"
              value={f.weekly_days}
              onChange={(v) => setF({ ...f, weekly_days: v })}
              placeholder="4"
              keyboard="number-pad"
              hint="1–7。少一点没关系，按实际能坚持的填。"
            />
            <Field
              label="体重（kg）"
              value={f.weight_kg}
              onChange={(v) => setF({ ...f, weight_kg: v })}
              placeholder="65"
              keyboard="decimal-pad"
              hint="只用于估算补给量，可以不填。"
            />
            <Field
              label="比赛日期"
              value={f.race_date}
              onChange={(v) => setF({ ...f, race_date: v })}
              placeholder="2027-03-21"
              keyboard="numbers-and-punctuation"
              hint="填了才会按比赛倒排周期，不填就按 12 周通用安排。"
            />
            <Field
              label="目标比赛距离（km）"
              value={f.race_distance_km}
              onChange={(v) => setF({ ...f, race_distance_km: v })}
              placeholder="21.1 / 42.195 / 10"
              keyboard="decimal-pad"
              hint="决定课表专项；留空时从目标文字或历史最长跑推断。"
            />
          </Card>
        </Section>

        <Section title="负荷模型（可选）" desc="不填就用近 28 天观测值，再缺才用默认系数">
          <Card>
            <Field
              label="静息心率"
              value={f.resting_hr}
              onChange={(v) => setF({ ...f, resting_hr: v })}
              placeholder="55"
              keyboard="number-pad"
              hint="晨起静息心率。填了比默认 55 更准。"
            />
            <Field
              label="最大心率"
              value={f.max_hr}
              onChange={(v) => setF({ ...f, max_hr: v })}
              placeholder="190"
              keyboard="number-pad"
              hint="实测最大心率，不是 220−年龄的估算值。"
            />
            <Field
              label="性别"
              value={f.sex}
              onChange={(v) => setF({ ...f, sex: v })}
              placeholder="male / female / other"
              hint="只影响 TRIMP 系数；不填按男性系数估算。"
            />
          </Card>
        </Section>

        {err ? <Text style={[s.err, { color: t.bad }]}>{err}</Text> : null}

        <View style={{ paddingHorizontal: S.md, marginTop: S.md }}>
          <Btn title={saving ? '保存中…' : '保存'} onPress={save} primary disabled={saving} />
        </View>

        <View style={{ paddingHorizontal: S.md, marginTop: S.sm }}>
          <Btn
            title="从历史跑步记录自动识别 5 公里成绩"
            small
            disabled={saving}
            onPress={async () => {
              setSaving(true);
              setErr('');
              try {
                const r = await api.post<any>('/api/profile/five-k/auto', {});
                if (!r.ok) {
                  setErr(r.reason || '没找到可用的跑步记录');
                  return;
                }
                setF({ ...f, five_k_pb_min: r.pb.text });
                Alert.alert(
                  '识别成功',
                  `${r.pb.text}（${r.pb.detail}）\n已填进上面的输入框，点「保存」确认即可。`,
                );
              } catch (e: any) {
                setErr(e?.message || '识别失败');
              } finally {
                setSaving(false);
              }
            }}
          />
          <Text style={{ color: t.text3, fontSize: T.caption, marginTop: 6, lineHeight: 20 }}>
            取最快 5 公里；无记录时用 3–21 公里折算。手填成绩不会被覆盖。
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
  keyboard,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  keyboard?: 'default' | 'number-pad' | 'decimal-pad' | 'numbers-and-punctuation';
}) {
  const t = useTheme();
  const s = useStyles();
  return (
    <View style={s.field}>
      <Text style={[s.label, { color: t.text2 }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.text3}
        keyboardType={keyboard === 'numbers-and-punctuation' ? 'numbers-and-punctuation' : keyboard}
        autoCapitalize="none"
        style={[s.input, { color: t.text, backgroundColor: t.bgSoft, borderColor: t.borderSoft }]}
      />
      {hint ? <Text style={[s.hint, { color: t.text3 }]}>{hint}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((t: Theme) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  field: { marginBottom: S.md },
  label: { fontSize: T.caption, marginBottom: 6 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: S.md - 2,
    paddingVertical: 12,
    fontSize: 17,
  },
  hint: { fontSize: T.caption, lineHeight: 20, marginTop: 5 },
  err: { fontSize: T.caption, paddingHorizontal: S.md, marginTop: S.sm },
}));
