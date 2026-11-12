import React from 'react';
import { View, Text, StyleSheet, Alert, Pressable } from 'react-native';
import {
  api,
  TrainingSchedule,
  ScheduleWeek,
  ScheduleDay,
  StrengthProgramme,
  StrengthBlock,
} from '../api';
import { Card, CardHead, Section, Loading, ErrorBox, Pill, Stat, Btn, Fold } from '../ui';
import { Bars } from '../charts';
import { S, T, R, TNUM, alpha, type Theme } from '../theme';
import { makeStyles, useTheme } from '../theme-provider';
import { useRouter, useFocusEffect } from 'expo-router';
import { PbBadge } from '../personalize';
import { F } from '../format';
import { PHASE, PACE_ZONE, WORKOUT_TYPE, restLabel, setsLabel, zh } from '../labels';

/**
 * build 15：训练页只给最近两周、不再堆文字说明。
 * 「为什么这样排」「这份计划安全吗？」两整段文字卡片已删除；
 * 排课依据压成一行标签，配速区间默认折叠，每天内容用柱状图先看轮廓。
 * 本组件不含 Screen，由 app/(tabs)/plan/index.tsx 统一提供滚动容器。
 */
export default function TrainingView({ reloadKey = 0 }: { reloadKey?: number }) {
  const t = useTheme();
  const s = useStyles();
  const router = useRouter();
  const [data, setData] = React.useState<TrainingSchedule | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [openWeek, setOpenWeek] = React.useState<number | null>(null);
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

  useFocusEffect(React.useCallback(() => { load(); }, [load]));
  React.useEffect(() => { if (reloadKey) load(); }, [reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
  if (err && !data) return <ErrorBox message={err} onRetry={load} />;
  if (!data) return null;

  if (!data.weeks?.length) {
    return (
      <Card>
        <CardHead title="还没有训练计划" />
        <Text style={s.summary}>{(data as any).reason || '课表暂时读不出来，点右上角刷新重试。'}</Text>
        <View style={{ height: S.md }} />
        <Btn title="去完善资料" onPress={() => router.push('/profile')} primary small />
      </Card>
    );
  }

  // 最近两周：含今天这一周 + 下一周。12 周全展开在手机上没法看。
  const idx = data.weeks.findIndex((w) => w.days?.some((x) => x.is_today));
  const start = idx >= 0 ? idx : 0;
  const recent = data.weeks.slice(start, start + 2);
  const thisWeek = data.weeks[start];

  return (
    <>
      <PbBadge pb={(data as any).pb} />

      <Card>
        <CardHead
          title="训练计划"
          right={<Pill text={data.plan_basis ? `${data.plan_basis.race_label}专项` : '课表'} />}
        />
        <View style={{ flexDirection: 'row', gap: S.sm }}>
          <Stat label="比赛日期" value={data.race_date || '-'} />
          <Stat label="跑步能力值" value={F.num(data.vdot, 1)} big />
        </View>
        {thisWeek ? (
          <Text style={s.summary}>
            本周：跑 {thisWeek.run_days} 天 · 力量 {thisWeek.strength.sessions} 次 ·{' '}
            {thisWeek.phase_label}
          </Text>
        ) : null}
        {data.plan_basis ? (
          <Text style={s.basis}>
            起点 {data.plan_basis.start_km} 公里/周
            {data.plan_basis.start_week_km != null &&
            Math.abs(data.plan_basis.start_week_km - data.plan_basis.start_km) >= 0.2
              ? ` · 首周实际 ${F.num(data.plan_basis.start_week_km, 1)} 公里`
              : ''}
          </Text>
        ) : null}
      </Card>

      <Section title="最近两周" desc="点开看每天内容">
        {recent.map((w) => (
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

      <Section title="配速区间">
        <Fold label="查看各配速区间">
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
        </Fold>
      </Section>
    </>
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
  const km = week.days.map((d) => (d.run && d.run.type !== 'rest' ? Number(d.run.distance_km) || 0 : 0));
  const adjusted =
    week.planned_target_km != null &&
    Math.abs(Number(week.planned_target_km) - Number(week.target_km)) >= 0.1;
  return (
    <Card style={{ padding: 0, overflow: 'hidden', marginBottom: S.sm + 2 }}>
      <Pressable onPress={onToggle} style={s.weekHead}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={s.weekTitle}>第 {week.week} 周</Text>
            {hasToday ? <Pill text="本周" color={t.accent} /> : null}
          </View>
          <Text style={s.weekMeta}>
            目标 {F.num(week.target_km, 1)} 公里
            {adjusted ? `（原 ${F.num(week.planned_target_km, 1)}，手动调整后）` : ''} · 跑{' '}
            {week.run_days} 天 · 力量 {week.strength.sessions} 次
          </Text>
          {week.week_note ? <Text style={s.basis}>{week.week_note}</Text> : null}
        </View>
        <Pill text={week.phase_label || zh(PHASE, week.phase, '常规')} color={t.purple} />
      </Pressable>

      <View style={s.weekBars}>
        <Bars
          values={km}
          labels={week.days.map((d) => d.weekday)}
          height={78}
          color={t.accent}
          highlightLast={false}
        />
      </View>

      {open ? (
        <>
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
        day.past && { opacity: 0.55 },
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

        {isRest ? (
          <Text style={[s.rest, day.is_today && { color: t.text2 }]}>
            {ov?.type === 'strength' ? '力量训练' : '休息'}
          </Text>
        ) : (
          <View style={[s.item, { borderLeftColor: t.accent }]}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5, flexWrap: 'wrap' }}>
              <Text style={s.itemTitle}>{run!.label || zh(WORKOUT_TYPE, run!.type, '训练')}</Text>
              <Text style={[s.itemKm, { color: t.accent }]}>{F.num(run!.distance_km, 1)}</Text>
              <Text style={s.itemUnit}>公里</Text>
              {run!.target_pace && run!.target_pace !== '-' ? (
                <Text style={s.itemPace}>@ {run!.target_pace}</Text>
              ) : null}
            </View>
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
          </View>
        ) : null}
      </View>

      {!isRest && day.past ? (
        <Text style={{ color: t.text3, fontSize: T.caption }}>已过去</Text>
      ) : !isRest ? (
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
          <Text style={{ color: done ? t.good : t.accent, fontSize: T.caption, fontWeight: '600' }}>
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
            {programme.emphasis_label || ''} · {programme.duration_min} 分钟 · {programme.blocks?.length || 0} 个动作
          </Text>
        </View>
        <Text style={s.tip}>{open ? '收起' : '看动作'}</Text>
      </Pressable>

      {open ? (
        <View style={{ marginTop: S.sm }}>
          {programme.warmup?.length ? (
            <Text style={s.warmup}>热身：{programme.warmup.map((w) => w.name).join('、')}</Text>
          ) : null}
          <View style={{ marginTop: 5 }}>
            {programme.blocks?.map((b, i) => (
              <ExerciseRow key={i} block={b} index={i + 1} />
            ))}
          </View>
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
          <Text style={s.exTargets}>{e.targets?.join('、')}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.exSets}>{setsLabel(block.sets, block.reps, block.seconds)}</Text>
          <Text style={s.exTargets}>休息 {restLabel(block.rest_s)}</Text>
        </View>
      </View>

      <Text style={s.toggle}>{open ? '收起动作要领 ▴' : '看动作要领 ▾'}</Text>

      {open ? (
        <View style={[s.cueBox, { backgroundColor: t.bg }]}>
          {e.cues?.map((c, i) => (
            <Text key={i} style={s.cue}>
              {i + 1}) {c}
            </Text>
          ))}
          {block.tempo ? <Text style={s.cue}>节奏：{block.tempo}</Text> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const useStyles = makeStyles((t: Theme) => ({
  meta: { color: t.text3, fontSize: T.caption, lineHeight: 20 },
  summary: { color: t.text2, fontSize: T.caption + 1, marginTop: S.sm, lineHeight: 22 },
  basis: { color: t.text3, fontSize: T.caption, marginTop: 6 },
  tip: { color: t.accent, fontSize: T.caption, fontWeight: '500' },

  paceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  paceName: { color: t.text2, fontSize: T.body },
  paceVal: { color: t.accent, fontSize: T.body + 2, fontWeight: '600', ...TNUM },

  weekHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: S.md + 2,
    gap: S.sm,
  },
  weekTitle: { color: t.text, fontSize: T.body + 1, fontWeight: '600', letterSpacing: -0.2 },
  weekMeta: { color: t.text3, fontSize: T.caption, marginTop: 4, ...TNUM },
  weekBars: { paddingHorizontal: S.md + 2, paddingBottom: S.md },

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
  dayDate: { color: t.text3, fontSize: T.caption - 1, marginTop: 2, ...TNUM },
  rest: { color: t.text3, fontSize: T.caption, paddingTop: 2 },
  overrideRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  restoreText: { color: t.accent, fontSize: T.caption },

  item: { borderLeftWidth: 2.5, paddingLeft: 9, paddingVertical: 3, borderRadius: 2 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  itemTitle: { color: t.text, fontSize: T.body, fontWeight: '600' },
  itemKm: { fontSize: T.title + 4, fontWeight: '600', letterSpacing: -0.8, ...TNUM },
  itemUnit: { color: t.text3, fontSize: T.caption },
  itemPace: { color: t.text3, fontSize: T.caption, ...TNUM },
  checkin: {
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: R.pill,
    alignSelf: 'flex-start',
  },

  strengthBox: { borderTopWidth: StyleSheet.hairlineWidth, padding: S.md + 2 },
  strengthHead: { flexDirection: 'row', alignItems: 'center' },
  strengthTitle: { color: t.purple, fontSize: T.caption + 1, fontWeight: '600' },
  warmup: { color: t.text3, fontSize: T.caption, marginTop: S.sm, lineHeight: 20 },

  exRow: { paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth },
  exHead: { flexDirection: 'row', justifyContent: 'space-between' },
  exName: { color: t.text, fontSize: T.body, fontWeight: '500' },
  exSide: { color: t.text3, fontSize: T.caption, fontWeight: '400' },
  exTargets: { color: t.text3, fontSize: T.caption, marginTop: 3 },
  exSets: { color: t.accent, fontSize: T.body, fontWeight: '600', ...TNUM },
  toggle: { color: t.accent, fontSize: T.caption, marginTop: 7, opacity: 0.85 },
  cueBox: { marginTop: 8, padding: 11, borderRadius: R.xs, gap: 5 },
  cue: { color: t.text2, fontSize: T.caption, lineHeight: 21 },
}));
