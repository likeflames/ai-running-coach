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
import { Screen, Card, Section, Loading, ErrorBox, Empty, Pill, Stat } from '../../../src/ui';
import { C, S } from '../../../src/theme';
import { F } from '../../../src/format';
import { PHASE, PACE_ZONE, WORKOUT_TYPE, restLabel, setsLabel, zh } from '../../../src/labels';

const VERDICT = {
  ok: { color: C.good, label: '可以照着练' },
  review: { color: C.warn, label: '有两处要留意' },
  block: { color: C.bad, label: '先改再练' },
} as const;

export default function TrainingScreen() {
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

  React.useEffect(() => {
    load();
  }, [load]);

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
  if (err && !data) return <Screen><ErrorBox message={err} onRetry={load} /></Screen>;
  if (!data) return null;

  const g = data.guardrail;
  const v = g ? VERDICT[g.verdict] : null;
  const thisWeek = data.weeks.find((w) => w.days?.some((x) => x.is_today)) || data.weeks[0];

  return (
    <Screen>
      {/* 概览 */}
      <Card>
        <View style={styles.head}>
          <Text style={styles.cardTitle}>训练计划</Text>
          <Pill text={`${data.weeks.length} 周`} />
        </View>
        <View style={{ flexDirection: 'row', gap: S.sm, marginTop: 2 }}>
          <Stat label="比赛日期" value={data.race_date || '-'} />
          <Stat label="跑步能力值" value={F.num(data.vdot, 1)} />
        </View>
        {thisWeek ? (
          <Text style={styles.summary}>
            本周：跑 {thisWeek.run_days} 天 · 力量 {thisWeek.strength.sessions} 次（
            {thisWeek.strength.sessions_required} 次必做）· {thisWeek.phase_label}
          </Text>
        ) : null}
      </Card>

      {/* 合并课表 */}
      <Section title="每天练什么" right={<Text style={styles.tip}>力量已排进跑步日</Text>}>
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
          <Pressable onPress={() => setShowPrinciples((s) => !s)}>
            <Text style={styles.tip}>{showPrinciples ? '收起' : '展开'}</Text>
          </Pressable>
        }
      >
        {showPrinciples ? (
          <Card>
            {data.principles?.map((p, i) => (
              <View key={i} style={styles.ruleRow}>
                <Text style={styles.ruleDot}>·</Text>
                <Text style={styles.ruleText}>{p}</Text>
              </View>
            ))}
          </Card>
        ) : null}
      </Section>

      {/* 配速区间 */}
      <Section
        title="配速区间"
        right={
          <Pressable onPress={() => setShowPaces((s) => !s)}>
            <Text style={styles.tip}>{showPaces ? '收起' : '展开'}</Text>
          </Pressable>
        }
      >
        {showPaces ? (
          <Card>
            {Object.entries(data.paces || {}).map(([k, val], i, arr) => (
              <View key={k} style={[styles.paceRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                <Text style={styles.paceName}>{zh(PACE_ZONE, k, '其他区间')}</Text>
                <Text style={styles.paceVal}>{val}</Text>
              </View>
            ))}
          </Card>
        ) : null}
      </Section>

      {/* 安全护栏 */}
      {g && v ? (
        <Section title="这份计划安全吗？">
          <Card style={{ borderColor: v.color + '55' }}>
            <View style={styles.head}>
              <Text style={{ color: v.color, fontSize: 14, fontWeight: '600' }}>{v.label}</Text>
            </View>
            <Text style={styles.body}>{g.summary}</Text>
            <Text style={[styles.meta, { marginTop: 4 }]}>
              最近 4 周平均每周 {F.num(g.context?.avg_4w_km, 1)} 公里 · 最近 7 天跑了{' '}
              {F.num(g.context?.this_week_load_km, 1)} 公里
            </Text>
            {g.rules
              ?.filter((r) => r.severity !== 'info')
              .map((r) => (
                <View key={r.id} style={styles.ruleBox}>
                  <Text style={{ color: r.severity === 'block' ? C.bad : C.warn, fontSize: 12, fontWeight: '600' }}>
                    {r.severity === 'block' ? '⛔ ' : '⚠️ '}
                    {r.title || '需要注意'}
                  </Text>
                  <Text style={styles.ruleBody}>{r.message}</Text>
                  {r.action ? <Text style={styles.ruleAction}>怎么办：{r.action}</Text> : null}
                </View>
              ))}
            <Text style={styles.footNote}>
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
  const hasToday = week.days.some((d) => d.is_today);
  return (
    <Card style={{ padding: 0, overflow: 'hidden', marginBottom: S.sm }}>
      <Pressable onPress={onToggle} style={styles.weekHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.weekTitle}>
            第 {week.week} 周{hasToday ? ' · 本周' : ''}
          </Text>
          <Text style={styles.meta}>
            目标 {F.num(week.target_km, 1)} 公里 · 跑 {week.run_days} 天 · 力量{' '}
            {week.strength.sessions} 次
          </Text>
        </View>
        <Pill text={week.phase_label || zh(PHASE, week.phase, '常规')} color={C.purple} />
      </Pressable>

      {open ? (
        <>
          {week.strength.note ? <Text style={styles.weekNote}>{week.strength.note}</Text> : null}
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
  const run = day.run;
  const isRest = !run || run.type === 'rest';
  const ov = day.override;
  return (
    <View style={[styles.dayRow, day.is_today && styles.dayToday, last && { borderBottomWidth: 0 }]}>
      <View style={styles.dayLeft}>
        <Text style={[styles.dayWeekday, day.is_today && { color: C.accent }]}>{day.weekday}</Text>
        <Text style={styles.meta}>{F.dayShort(day.date)}</Text>
      </View>

      <View style={{ flex: 1, gap: 6 }}>
        {ov ? (
          <View style={styles.overrideRow}>
            <Pill text="手动调整" color={C.warn} />
            <Pressable onPress={onRestore} hitSlop={10}>
              <Text style={styles.restoreText}>恢复自动</Text>
            </Pressable>
          </View>
        ) : null}
        {ov?.note ? <Text style={styles.overrideNote}>{ov.note}</Text> : null}

        {isRest ? (
          <Text style={styles.rest}>
            {ov?.type === 'strength' ? '力量训练（教练安排）' : '休息'}
            {day.is_today ? '  👈 今天' : ''}
          </Text>
        ) : (
          <View style={[styles.item, { borderLeftColor: C.accent }]}>
            <Text style={styles.itemTitle}>
              {zh(WORKOUT_TYPE, run!.type, '训练')} · {F.num(run!.distance_km, 1)} 公里
              {run!.target_pace && run!.target_pace !== '-' ? ` @ ${run!.target_pace}` : ''}
              {day.is_today ? '  👈 今天' : ''}
            </Text>
            {run!.description ? (
              <Text style={styles.itemDesc} numberOfLines={2}>
                {run!.description}
              </Text>
            ) : null}
          </View>
        )}

        {day.strength ? (
          <View style={[styles.item, { borderLeftColor: C.purple, backgroundColor: C.purple + '0E' }]}>
            <View style={styles.itemHead}>
              <Text style={[styles.itemTitle, { color: C.purple }]}>
                力量 · {day.strength.duration_min ? `${day.strength.duration_min} 分钟` : '按方案做'}
              </Text>
              <Pill
                text={day.strength.optional ? '可选' : '必做'}
                color={day.strength.optional ? C.text3 : C.purple}
              />
            </View>
            <Text style={styles.itemDesc}>{day.strength.reason}</Text>
            {day.strength.caution ? <Text style={styles.caution}>{day.strength.caution}</Text> : null}
          </View>
        ) : null}
      </View>

      {!isRest ? (
        <Pressable onPress={onCheckin} disabled={done} style={[styles.checkin, done && { opacity: 0.5 }]}>
          <Text style={{ color: done ? C.good : C.accent, fontSize: 11 }}>{done ? '✓ 已打卡' : '打卡'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ---------------- 本周力量方案 ---------------- */

function StrengthBlockView({ programme }: { programme: StrengthProgramme }) {
  const [open, setOpen] = React.useState(false);
  return (
    <View style={styles.strengthBox}>
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.strengthHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.strengthTitle}>本周力量方案 · {programme.phase_label}</Text>
          <Text style={styles.meta}>
            {programme.emphasis_label || ''} · {programme.duration_min} 分钟 · 共{' '}
            {programme.blocks?.length || 0} 个动作
          </Text>
        </View>
        <Text style={styles.tip}>{open ? '收起 ▴' : '看动作 ▾'}</Text>
      </Pressable>

      {open ? (
        <View style={{ marginTop: S.sm }}>
          {programme.purpose ? <Text style={styles.body}>{programme.purpose}</Text> : null}
          {programme.warmup?.length ? (
            <Text style={styles.warmup}>热身：{programme.warmup.map((w) => w.name).join('、')}</Text>
          ) : null}
          <View style={{ marginTop: 4 }}>
            {programme.blocks?.map((b, i) => (
              <ExerciseRow key={i} block={b} index={i + 1} />
            ))}
          </View>
          {programme.notes?.length ? (
            <View style={styles.notes}>
              {programme.notes.map((n, i) => (
                <Text key={i} style={styles.noteLine}>
                  · {n}
                </Text>
              ))}
            </View>
          ) : null}
          {programme.cooldown?.length ? (
            <Text style={styles.warmup}>
              收尾：{programme.cooldown.map((w) => w.name).join('、')}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** 单个动作：默认收起，点一下展开要领 */
function ExerciseRow({ block, index }: { block: StrengthBlock; index: number }) {
  const [open, setOpen] = React.useState(false);
  const e = block.exercise;
  return (
    <Pressable onPress={() => setOpen((o) => !o)} style={styles.exRow}>
      <View style={styles.exHead}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={styles.exName}>
            <Text style={{ color: C.accent }}>{index}. </Text>
            {e.name}
            {block.each_side ? <Text style={styles.exSide}>（每侧）</Text> : null}
          </Text>
          <Text style={styles.exTargets}>
            {e.targets?.join('、')}
            {e.equipment_label ? ` · ${e.equipment_label}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.exSets}>{setsLabel(block.sets, block.reps, block.seconds)}</Text>
          <Text style={styles.exTargets}>休息 {restLabel(block.rest_s)}</Text>
        </View>
      </View>

      {block.load ? <Text style={styles.load}>负荷：{block.load}</Text> : null}

      <Text style={styles.toggle}>{open ? '收起动作要领 ▴' : '看动作要领 ▾'}</Text>

      {open ? (
        <View style={styles.cueBox}>
          {e.cues?.map((c, i) => (
            <Text key={i} style={styles.cue}>
              {i + 1}) {c}
            </Text>
          ))}
          {block.tempo ? <Text style={styles.cue}>节奏：{block.tempo}</Text> : null}
          <Text style={styles.warnText}>出现尖锐疼痛（不是单纯的肌肉酸痛）就停下。</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: '600' },
  meta: { color: C.text3, fontSize: 11 },
  body: { color: C.text2, fontSize: 12, lineHeight: 19, marginTop: 6 },
  summary: { color: C.text2, fontSize: 12, marginTop: S.sm, lineHeight: 18 },
  tip: { color: C.accent, fontSize: 11 },

  paceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  paceName: { color: C.text2, fontSize: 13 },
  paceVal: { color: C.accent, fontSize: 14, fontWeight: '600' },

  ruleRow: { flexDirection: 'row', gap: 6, marginTop: 6, alignItems: 'flex-start' },
  ruleDot: { color: C.purple, fontSize: 14, lineHeight: 19 },
  ruleText: { color: C.text2, fontSize: 12, flex: 1, lineHeight: 19 },
  ruleBox: {
    marginTop: S.sm,
    paddingTop: S.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    gap: 3,
  },
  ruleBody: { color: C.text2, fontSize: 12, lineHeight: 19 },
  ruleAction: { color: C.accent, fontSize: 12, lineHeight: 19 },
  footNote: { color: C.text3, fontSize: 11, lineHeight: 17, marginTop: S.sm },

  weekHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: S.md,
  },
  weekTitle: { color: C.text, fontSize: 14, fontWeight: '600' },
  weekNote: {
    color: C.warn,
    fontSize: 11,
    paddingHorizontal: S.md,
    paddingBottom: 6,
    lineHeight: 16,
  },

  dayRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: S.md,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    gap: 8,
  },
  dayToday: { backgroundColor: C.accent + '12' },
  dayLeft: { width: 44, paddingTop: 1 },
  dayWeekday: { color: C.text2, fontSize: 12, fontWeight: '600' },
  rest: { color: C.text3, fontSize: 12, paddingTop: 2 },
  overrideRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  restoreText: { color: C.accent, fontSize: 11 },
  overrideNote: { color: C.text3, fontSize: 11, lineHeight: 16 },

  item: {
    borderLeftWidth: 2,
    paddingLeft: 8,
    paddingVertical: 2,
  },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemTitle: { color: C.text, fontSize: 12.5, fontWeight: '600' },
  itemDesc: { color: C.text3, fontSize: 11, marginTop: 2, lineHeight: 16 },
  caution: { color: C.warn, fontSize: 11, marginTop: 3, lineHeight: 16 },
  checkin: {
    marginTop: 2,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.accent + '66',
    alignSelf: 'flex-start',
  },

  strengthBox: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    padding: S.md,
    backgroundColor: C.cardInner,
  },
  strengthHead: { flexDirection: 'row', alignItems: 'center' },
  strengthTitle: { color: C.purple, fontSize: 13, fontWeight: '600' },
  warmup: { color: C.text3, fontSize: 11, marginTop: S.sm, lineHeight: 17 },
  notes: { marginTop: S.sm, paddingTop: S.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  noteLine: { color: C.text3, fontSize: 11, lineHeight: 18 },

  exRow: {
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  exHead: { flexDirection: 'row', justifyContent: 'space-between' },
  exName: { color: C.text, fontSize: 13, fontWeight: '500' },
  exSide: { color: C.text3, fontSize: 11, fontWeight: '400' },
  exTargets: { color: C.text3, fontSize: 11, marginTop: 2 },
  exSets: { color: C.accent, fontSize: 13, fontWeight: '600' },
  load: { color: C.warn, fontSize: 11, lineHeight: 17, marginTop: 5 },
  toggle: { color: C.accent + 'cc', fontSize: 11, marginTop: 6 },
  cueBox: {
    marginTop: 6,
    padding: 9,
    borderRadius: 8,
    backgroundColor: C.bg,
    gap: 4,
  },
  cue: { color: C.text2, fontSize: 11.5, lineHeight: 18 },
  warnText: { color: C.bad, fontSize: 11, marginTop: 4 },
});
