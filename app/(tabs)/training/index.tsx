import React from 'react';
import { View, Text, StyleSheet, Alert, Pressable } from 'react-native';
import {
  api,
  TrainingSchedule,
  ScheduleWeek,
  ScheduleDay,
  StrengthProgramme,
  StrengthBlock,
} from '../../../src/api';
import { Screen, Card, CardHead, Section, Loading, ErrorBox, Empty, Pill, Stat, Btn } from '../../../src/ui';
import { S, T, R, TNUM, alpha, type Theme } from '../../../src/theme';
import { makeStyles, useTheme } from '../../../src/theme-provider';
import { useRouter, useFocusEffect } from 'expo-router';
import { PbBadge, PersonalizationCard } from '../../../src/personalize';
import { F } from '../../../src/format';
import { PHASE, PACE_ZONE, WORKOUT_TYPE, restLabel, setsLabel, zh } from '../../../src/labels';

function verdictOf(t: Theme, verdict: string) {
  const map: Record<string, { color: string; label: string }> = {
    ok: { color: t.good, label: '可以照着练' },
    review: { color: t.warn, label: '有两处要留意' },
    block: { color: t.bad, label: '先改再练' },
  };
  return map[verdict] || null;
}

export default function TrainingScreen() {
  const t = useTheme();
  const s = useStyles();
  const router = useRouter();
  const [data, setData] = React.useState<TrainingSchedule | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [openWeek, setOpenWeek] = React.useState<number | null>(null);
  const [showPrinciples, setShowPrinciples] = React.useState(true);
  const [showPaces, setShowPaces] = React.useState(false);
  const [done, setDone] = React.useState<Record<string, boolean>>({});

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<TrainingSchedule>('/api/training/schedule?weeks=12');
      setData(d);
      setErr(null);
      const thisWeek = d.weeks?.find((w) => w.days?.some((x) => x.is_today));
      setOpenWeek(thisWeek ? thisWeek.week : d.weeks?.[0]?.week ?? null);
    } catch (e: any) {
      setErr(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 标签页常驻，useEffect 只在挂载跑一次：填完档案返回时不会刷新，
  // 会一直停在旧的「需要 5 公里成绩」提示上。每次获得焦点都重拉。
  useFocusEffect(React.useCallback(() => { load(); }, [load]));

  const checkin = (day: string) => {
    Alert.prompt?.('打卡', '实际跑了多少公里？（可留空）', async (km) => {
      try {
        const payload: Record<string, string | number> = { date: day, completed: 'true' };
        if (km && !Number.isNaN(Number(km))) payload.actual_km = Number(km);
        await api.form('/api/checkin', payload);
        setDone((d) => ({ ...d, [day]: true }));
      } catch (e: any) {
        Alert.alert('打卡失败', e?.message || '未知错误');
      }
    });
  };

  const restore = (day: string) => {
    Alert.alert('恢复自动排课', `撤销 ${day} 的手动调整？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '恢复',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.form('/api/plan-override/clear', { day });
            await load();
          } catch (e: any) {
            Alert.alert('撤销失败', e?.message || '未知错误');
          }
        },
      },
    ]);
  };

  if (loading && !data) return <Loading />;
  if (err && !data)
    return (
      <Screen>
        <ErrorBox message={err} onRetry={load} />
      </Screen>
    );
  if (!data) return null;

  // 新用户没填目标 / 5 公里成绩时，后端只回 {"needs_profile": true, "reason": ...}，
  // 没有 weeks。这里不拦住的话，下面的 data.weeks.find 会直接白屏。
  if (!data.weeks?.length) {
    return (
      <Screen>
        <Card>
          <CardHead title="还没有训练计划" />
          <Text style={s.summary}>
            {(data as any).reason || '课表暂时读不出来，下拉重试或稍后再试。'}
          </Text>
          <View style={{ height: S.md }} />
          <Btn title="去完善资料" onPress={() => router.push('/profile')} primary small />
        </Card>
      </Screen>
    );
  }

  const g = data.guardrail;
  const v = g ? verdictOf(t, g.verdict) : null;
  const thisWeek = data.weeks.find((w) => w.days?.some((x) => x.is_today)) || data.weeks[0];

  return (
    <Screen>
      <PbBadge pb={(data as any).pb} />
      <PersonalizationCard scope="training" />

      {/* 概览 */}
      <Card>
        <CardHead title="训练计划" right={<Pill text={`${data.weeks.length} 周`} />} />
        <View style={{ flexDirection: 'row', gap: S.sm }}>
          <Stat label="比赛日期" value={data.race_date || '-'} />
          <Stat label="跑步能力值" value={F.num(data.vdot, 1)} big />
        </View>
        {thisWeek ? (
          <Text style={s.summary}>
            本周：跑 {thisWeek.run_days} 天 · 力量 {thisWeek.strength.sessions} 次（
            {thisWeek.strength.sessions_required} 次必做）· {thisWeek.phase_label}
          </Text>
        ) : null}
      </Card>

      {/* 合并课表 */}
      <Section title="每天练什么" desc="力量已排进跑步日">
        {data.weeks.map((w) => (
          <WeekCard
            key={w.week}
            week={w}
            programme={data.programmes?.[w.strength.phase]}
            open={openWeek === w.week}
            onToggle={() => setOpenWeek(openWeek === w.week ? null : w.week)}
            onCheckin={checkin}
            onRestore={restore}
            done={done}
          />
        ))}
      </Section>

      {/* 排布原则 */}
      <Section
        title="为什么这样排"
        right={
          <Pressable onPress={() => setShowPrinciples((x) => !x)} hitSlop={10}>
            <Text style={s.tip}>{showPrinciples ? '收起' : '展开'}</Text>
          </Pressable>
        }
      >
        {showPrinciples ? (
          <Card>
            {data.principles?.map((p, i) => (
              <View key={i} style={s.ruleRow}>
                <View style={[s.ruleBullet, { backgroundColor: t.purple }]} />
                <Text style={s.ruleText}>{p}</Text>
              </View>
            ))}
          </Card>
        ) : null}
      </Section>

      {/* 配速区间 */}
      <Section
        title="配速区间"
        right={
          <Pressable onPress={() => setShowPaces((x) => !x)} hitSlop={10}>
            <Text style={s.tip}>{showPaces ? '收起' : '展开'}</Text>
          </Pressable>
        }
      >
        {showPaces ? (
          <Card>
            {Object.entries(data.paces || {}).map(([k, val], i, arr) => (
              <View
                key={k}
                style={[s.paceRow, { borderBottomColor: t.border }, i === arr.length - 1 && { borderBottomWidth: 0 }]}
              >
                <Text style={s.paceName}>{zh(PACE_ZONE, k, '其他区间')}</Text>
                <Text style={s.paceVal}>{val}</Text>
              </View>
            ))}
          </Card>
        ) : null}
      </Section>

      {/* 安全护栏 */}
      {g && v ? (
        <Section title="这份计划安全吗？">
          <Card tint={v.color}>
            <Text style={{ color: v.color, fontSize: T.title, fontWeight: '600', letterSpacing: -0.3, marginBottom: 8 }}>
              {v.label}
            </Text>
            <Text style={s.body}>{g.summary}</Text>
            <Text style={[s.meta, { marginTop: 6 }]}>
              最近 4 周平均每周 {F.num(g.context?.avg_4w_km, 1)} 公里 · 最近 7 天跑了{' '}
              {F.num(g.context?.this_week_load_km, 1)} 公里
            </Text>
            {g.rules
              ?.filter((r) => r.severity !== 'info')
              .map((r) => (
                <View key={r.id} style={[s.ruleBox, { borderTopColor: t.border }]}>
                  <Text
                    style={{
                      color: r.severity === 'block' ? t.bad : t.warn,
                      fontSize: T.caption,
                      fontWeight: '600',
                      marginBottom: 3,
                    }}
                  >
                    {r.severity === 'block' ? '⛔ ' : '⚠️ '}
                    {r.title || '需要注意'}
                  </Text>
                  <Text style={s.ruleBody}>{r.message}</Text>
                  {r.action ? <Text style={s.ruleAction}>怎么办：{r.action}</Text> : null}
                </View>
              ))}
            <Text style={s.footNote}>
              检查的是三件事：一周加量是否超过身体能承受的幅度、有没有连续几周不休、状态很差时有没有硬上强度。
            </Text>
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}

/* ---------------- 一周 ---------------- */

function WeekCard({
  week,
  programme,
  open,
  onToggle,
  onCheckin,
  onRestore,
  done,
}: {
  week: ScheduleWeek;
  programme?: StrengthProgramme;
  open: boolean;
  onToggle: () => void;
  onCheckin: (day: string) => void;
  onRestore: (day: string) => void;
  done: Record<string, boolean>;
}) {
  const t = useTheme();
  const s = useStyles();
  const hasToday = week.days.some((d) => d.is_today);
  return (
    <Card style={{ padding: 0, overflow: 'hidden', marginBottom: S.sm + 2 }}>
      <Pressable onPress={onToggle} style={s.weekHead}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={s.weekTitle}>第 {week.week} 周</Text>
            {hasToday ? <Pill text="本周" color={t.accent} /> : null}
          </View>
          <Text style={s.weekMeta}>
            目标 {F.num(week.target_km, 1)} 公里 · 跑 {week.run_days} 天 · 力量 {week.strength.sessions} 次
          </Text>
        </View>
        <Pill text={week.phase_label || zh(PHASE, week.phase, '常规')} color={t.purple} />
      </Pressable>

      {open ? (
        <>
          {week.strength.note ? <Text style={s.weekNote}>{week.strength.note}</Text> : null}
          {week.days.map((d, i) => (
            <DayRow
              key={d.date}
              day={d}
              done={!!done[d.date]}
              onCheckin={() => onCheckin(d.date)}
              onRestore={() => onRestore(d.date)}
              last={i === week.days.length - 1}
            />
          ))}
          {programme ? <StrengthBlockView programme={programme} /> : null}
        </>
      ) : null}
    </Card>
  );
}

function DayRow({
  day,
  done,
  onCheckin,
  onRestore,
  last,
}: {
  day: ScheduleDay;
  done: boolean;
  onCheckin: () => void;
  onRestore: () => void;
  last: boolean;
}) {
  const t = useTheme();
  const s = useStyles();
  const run = day.run;
  const isRest = !run || run.type === 'rest';
  const ov = day.override;
  return (
    <View
      style={[
        s.dayRow,
        { borderTopColor: t.border },
        day.is_today && { backgroundColor: alpha(t.accent, t.dark ? 0.1 : 0.07) },
        last && { borderBottomWidth: 0 },
      ]}
    >
      <View style={s.dayLeft}>
        <Text style={[s.dayWeekday, day.is_today && { color: t.accent }]}>{day.weekday}</Text>
        <Text style={s.dayDate}>{F.dayShort(day.date)}</Text>
      </View>

      <View style={{ flex: 1, gap: 7 }}>
        {ov ? (
          <View style={s.overrideRow}>
            <Pill text="手动调整" color={t.warn} />
            <Pressable onPress={onRestore} hitSlop={10}>
              <Text style={s.restoreText}>恢复自动</Text>
            </Pressable>
          </View>
        ) : null}
        {ov?.note ? <Text style={s.overrideNote}>{ov.note}</Text> : null}

        {isRest ? (
          <Text style={[s.rest, day.is_today && { color: t.text2 }]}>
            {ov?.type === 'strength' ? '力量训练（教练安排）' : '休息'}
          </Text>
        ) : (
          <View style={[s.item, { borderLeftColor: t.accent }]}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
              <Text style={s.itemTitle}>{zh(WORKOUT_TYPE, run!.type, '训练')}</Text>
              <Text style={[s.itemKm, { color: t.accent }]}>{F.num(run!.distance_km, 1)}</Text>
              <Text style={s.itemUnit}>公里</Text>
              {run!.target_pace && run!.target_pace !== '-' ? (
                <Text style={s.itemPace}>@ {run!.target_pace}</Text>
              ) : null}
            </View>
            {run!.description ? (
              <Text style={s.itemDesc} numberOfLines={2}>
                {run!.description}
              </Text>
            ) : null}
          </View>
        )}

        {day.strength ? (
          <View
            style={[
              s.item,
              { borderLeftColor: t.purple, backgroundColor: alpha(t.purple, t.dark ? 0.09 : 0.06) },
            ]}
          >
            <View style={s.itemHead}>
              <Text style={[s.itemTitle, { color: t.purple }]}>
                力量 · {day.strength.duration_min ? `${day.strength.duration_min} 分钟` : '按方案做'}
              </Text>
              <Pill text={day.strength.optional ? '可选' : '必做'} color={day.strength.optional ? t.text3 : t.purple} />
            </View>
            <Text style={s.itemDesc}>{day.strength.reason}</Text>
            {day.strength.caution ? <Text style={s.caution}>{day.strength.caution}</Text> : null}
          </View>
        ) : null}
      </View>

      {!isRest ? (
        <Pressable
          onPress={onCheckin}
          disabled={done}
          style={[
            s.checkin,
            {
              backgroundColor: alpha(done ? t.good : t.accent, t.dark ? 0.15 : 0.1),
              opacity: done ? 0.7 : 1,
            },
          ]}
        >
          <Text style={{ color: done ? t.good : t.accent, fontSize: T.micro + 0.5, fontWeight: '600' }}>
            {done ? '已打卡' : '打卡'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ---------------- 本周力量方案 ---------------- */

function StrengthBlockView({ programme }: { programme: StrengthProgramme }) {
  const t = useTheme();
  const s = useStyles();
  const [open, setOpen] = React.useState(false);
  return (
    <View style={[s.strengthBox, { borderTopColor: t.border, backgroundColor: t.cardInner }]}>
      <Pressable onPress={() => setOpen((o) => !o)} style={s.strengthHead}>
        <View style={{ flex: 1 }}>
          <Text style={s.strengthTitle}>本周力量方案 · {programme.phase_label}</Text>
          <Text style={s.meta}>
            {programme.emphasis_label || ''} · {programme.duration_min} 分钟 · 共 {programme.blocks?.length || 0} 个动作
          </Text>
        </View>
        <Text style={s.tip}>{open ? '收起 ▴' : '看动作 ▾'}</Text>
      </Pressable>

      {open ? (
        <View style={{ marginTop: S.sm }}>
          {programme.purpose ? <Text style={s.body}>{programme.purpose}</Text> : null}
          {programme.warmup?.length ? (
            <Text style={s.warmup}>热身：{programme.warmup.map((w) => w.name).join('、')}</Text>
          ) : null}
          <View style={{ marginTop: 5 }}>
            {programme.blocks?.map((b, i) => (
              <ExerciseRow key={i} block={b} index={i + 1} />
            ))}
          </View>
          {programme.notes?.length ? (
            <View style={[s.notes, { borderTopColor: t.border }]}>
              {programme.notes.map((n, i) => (
                <Text key={i} style={s.noteLine}>
                  · {n}
                </Text>
              ))}
            </View>
          ) : null}
          {programme.cooldown?.length ? (
            <Text style={s.warmup}>收尾：{programme.cooldown.map((w) => w.name).join('、')}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** 单个动作：默认收起，点一下展开要领 */
function ExerciseRow({ block, index }: { block: StrengthBlock; index: number }) {
  const t = useTheme();
  const s = useStyles();
  const [open, setOpen] = React.useState(false);
  const e = block.exercise;
  return (
    <Pressable onPress={() => setOpen((o) => !o)} style={[s.exRow, { borderTopColor: t.border }]}>
      <View style={s.exHead}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={s.exName}>
            <Text style={{ color: t.accent }}>{index}. </Text>
            {e.name}
            {block.each_side ? <Text style={s.exSide}>（每侧）</Text> : null}
          </Text>
          <Text style={s.exTargets}>
            {e.targets?.join('、')}
            {e.equipment_label ? ` · ${e.equipment_label}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.exSets}>{setsLabel(block.sets, block.reps, block.seconds)}</Text>
          <Text style={s.exTargets}>休息 {restLabel(block.rest_s)}</Text>
        </View>
      </View>

      {block.load ? <Text style={s.load}>负荷：{block.load}</Text> : null}

      <Text style={s.toggle}>{open ? '收起动作要领 ▴' : '看动作要领 ▾'}</Text>

      {open ? (
        <View style={[s.cueBox, { backgroundColor: t.bg }]}>
          {e.cues?.map((c, i) => (
            <Text key={i} style={s.cue}>
              {i + 1}) {c}
            </Text>
          ))}
          {block.tempo ? <Text style={s.cue}>节奏：{block.tempo}</Text> : null}
          <Text style={s.warnText}>出现尖锐疼痛（不是单纯的肌肉酸痛）就停下。</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const useStyles = makeStyles((t: Theme) => ({
  meta: { color: t.text3, fontSize: T.micro + 1, lineHeight: 18 },
  body: { color: t.text2, fontSize: T.caption, lineHeight: 21, marginTop: 6 },
  summary: { color: t.text2, fontSize: T.caption, marginTop: S.sm, lineHeight: 20 },
  tip: { color: t.accent, fontSize: T.micro + 1, fontWeight: '500' },

  paceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  paceName: { color: t.text2, fontSize: T.body },
  paceVal: { color: t.accent, fontSize: T.body + 1, fontWeight: '600', ...TNUM },

  ruleRow: { flexDirection: 'row', gap: 9, marginVertical: 6, alignItems: 'flex-start' },
  ruleBullet: { width: 5, height: 5, borderRadius: 3, marginTop: 8 },
  ruleText: { color: t.text2, fontSize: T.caption, flex: 1, lineHeight: 21 },
  ruleBox: {
    marginTop: S.md,
    paddingTop: S.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ruleBody: { color: t.text2, fontSize: T.caption, lineHeight: 21 },
  ruleAction: { color: t.accent, fontSize: T.caption, lineHeight: 21, marginTop: 2 },
  footNote: { color: t.text3, fontSize: T.micro + 1, lineHeight: 19, marginTop: S.md },

  weekHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: S.md + 2,
    gap: S.sm,
  },
  weekTitle: { color: t.text, fontSize: T.body + 1, fontWeight: '600', letterSpacing: -0.2 },
  weekMeta: { color: t.text3, fontSize: T.micro + 1, marginTop: 4, ...TNUM },
  weekNote: {
    color: t.warn,
    fontSize: T.micro + 1,
    paddingHorizontal: S.md + 2,
    paddingBottom: 8,
    lineHeight: 18,
  },

  dayRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: S.md,
    paddingVertical: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: S.sm,
  },
  dayLeft: { width: 46, paddingTop: 1 },
  dayWeekday: { color: t.text2, fontSize: T.caption, fontWeight: '600' },
  dayDate: { color: t.text3, fontSize: T.micro, marginTop: 2, ...TNUM },
  rest: { color: t.text3, fontSize: T.caption, paddingTop: 2 },
  overrideRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  restoreText: { color: t.accent, fontSize: T.micro + 1, fontWeight: '500' },
  overrideNote: { color: t.text3, fontSize: T.micro + 1, lineHeight: 18 },

  item: {
    borderLeftWidth: 2.5,
    paddingLeft: 9,
    paddingVertical: 3,
    borderRadius: 2,
  },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  itemTitle: { color: t.text, fontSize: T.body, fontWeight: '600' },
  itemKm: { fontSize: T.title + 4, fontWeight: '600', letterSpacing: -0.8, ...TNUM },
  itemUnit: { color: t.text3, fontSize: T.micro + 1 },
  itemPace: { color: t.text3, fontSize: T.micro + 1, ...TNUM },
  itemDesc: { color: t.text3, fontSize: T.micro + 1, marginTop: 4, lineHeight: 18 },
  caution: { color: t.warn, fontSize: T.micro + 1, marginTop: 4, lineHeight: 18 },
  checkin: {
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: R.pill,
    alignSelf: 'flex-start',
  },

  strengthBox: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: S.md + 2,
  },
  strengthHead: { flexDirection: 'row', alignItems: 'center' },
  strengthTitle: { color: t.purple, fontSize: T.caption, fontWeight: '600' },
  warmup: { color: t.text3, fontSize: T.micro + 1, marginTop: S.sm, lineHeight: 19 },
  notes: { marginTop: S.sm, paddingTop: S.sm, borderTopWidth: StyleSheet.hairlineWidth },
  noteLine: { color: t.text3, fontSize: T.micro + 1, lineHeight: 20 },

  exRow: {
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  exHead: { flexDirection: 'row', justifyContent: 'space-between' },
  exName: { color: t.text, fontSize: T.body, fontWeight: '500' },
  exSide: { color: t.text3, fontSize: T.micro, fontWeight: '400' },
  exTargets: { color: t.text3, fontSize: T.micro + 0.5, marginTop: 3 },
  exSets: { color: t.accent, fontSize: T.body, fontWeight: '600', ...TNUM },
  load: { color: t.warn, fontSize: T.micro + 1, lineHeight: 19, marginTop: 5 },
  toggle: { color: t.accent, fontSize: T.micro + 1, marginTop: 7, opacity: 0.85 },
  cueBox: {
    marginTop: 8,
    padding: 11,
    borderRadius: R.xs,
    gap: 5,
  },
  cue: { color: t.text2, fontSize: T.micro + 1.5, lineHeight: 20 },
  warnText: { color: t.bad, fontSize: T.micro + 1, marginTop: 5 },
}));
