/* 轻量图表：SVG 手绘，零第三方图表依赖（与 Web 端思路一致） */
import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import Svg, { Path, Line, Circle, Rect, Text as SvgText, Polyline } from 'react-native-svg';
import { S, T, TNUM, alpha, type Theme } from './theme';
import { makeStyles, useTheme } from './theme-provider';

/* ---------- 圆弧工具 ----------
 * 角度用标准极坐标：0° 在右、90° 在下、180° 在左、270° 在上。
 * 沿角度增大的方向画弧（SVG sweep-flag=1），所以 180→360 正好是上半圆。
 */
function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number) {
  const span = Math.min(Math.max(toDeg - fromDeg, 0), 359.9);
  const a = polar(cx, cy, r, fromDeg);
  const b = polar(cx, cy, r, fromDeg + span);
  const large = span > 180 ? 1 : 0;
  return `M${a.x.toFixed(2)},${a.y.toFixed(2)} A${r},${r} 0 ${large} 1 ${b.x.toFixed(2)},${b.y.toFixed(2)}`;
}

function buildPath(
  points: (number | null | undefined)[],
  w: number,
  h: number,
  min: number,
  max: number,
  xs?: (number | null)[]
) {
  if (!points.length) return '';
  const span = max - min || 1;
  const stepX = points.length > 1 ? w / (points.length - 1) : w;
  let d = '';
  let penDown = false;
  points.forEach((v, i) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      penDown = false; // 缺失值断开，不要画到 0 附近
      return;
    }
    const x = xs && xs[i] != null ? (xs[i] as number) : i * stepX;
    const y = h - ((v - min) / span) * h;
    d += `${penDown ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `;
    penDown = true;
  });
  return d.trim();
}

/** 折线 / 面积图 */
export function Sparkline({
  values,
  height = 90,
  color,
  area = true,
  labels,
  baseline = 'zero',
  showRange = false,
  formatValue,
  times,
}: {
  values: (number | null | undefined)[];
  height?: number;
  color?: string;
  area?: boolean;
  labels?: string[];
  /**
   * zero：从 0 起画（跑量这类有绝对零点的数据）
   * auto：用数据自身范围（心率/海拔/步频），否则 140–160 会压成一条直线
   */
  baseline?: 'zero' | 'auto';
  showRange?: boolean;
  formatValue?: (v: number) => string;
  /** 秒级样本的时间戳；给了就按真实时间比例画 x 轴，而不是样本序号 */
  times?: (number | null)[];
}) {
  const t = useTheme();
  const s = useStyles();
  const stroke = color || t.accent;
  const [w, setW] = React.useState(0);
  const pad = 4;
  const clean = values.filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v)
  );
  const min = baseline === 'auto' ? Math.min(...clean) : Math.min(...clean, 0);
  const max = baseline === 'auto' ? Math.max(...clean) : Math.max(...clean, 1);
  const h = height - pad * 2;
  const xs = React.useMemo(() => {
    if (!times || times.length !== values.length) return undefined;
    const first = times.find((v) => typeof v === 'number') as number | undefined;
    const last = [...times].reverse().find((v) => typeof v === 'number') as number | undefined;
    if (first == null || last == null || last <= first) return undefined;
    const span = last - first;
    return times.map((v) =>
      typeof v === 'number' ? ((v - first) / span) * w : null
    );
  }, [times, values.length, w]);
  const line = buildPath(values, w, h, min, max, xs);
  const hasGap = clean.length !== values.length;
  const areaPath = w > 0 && values.length > 0 && !hasGap
    ? `${line} L${w},${h} L0,${h} Z`
    : '';
  const f = formatValue || ((v: number) => String(Math.round(v * 10) / 10));

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height }}>
      {w > 0 && clean.length > 1 ? (
        <Svg width={w} height={height}>
          <Line x1={0} y1={h + pad} x2={w} y2={h + pad} stroke={t.border} strokeWidth={1} />
          {area && areaPath ? (
            <Path
              d={`M0,${pad} ${areaPath.replace(/^M[^ ]+ /, '')}`}
              fill={alpha(stroke, 0.14)}
              stroke="none"
            />
          ) : null}
          <Path d={line} stroke={stroke} strokeWidth={2.4} fill="none" transform={`translate(0,${pad})`} />
        </Svg>
      ) : (
        <View style={s.ph}>
          <Text style={{ color: t.text3, fontSize: T.caption }}>暂无数据</Text>
        </View>
      )}
      {showRange && clean.length ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
          <Text style={s.lbl}>{f(min)}</Text>
          <Text style={s.lbl}>{f(max)}</Text>
        </View>
      ) : null}
      {labels && labels.length ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={s.lbl}>{labels[0]}</Text>
          <Text style={s.lbl}>{labels[labels.length - 1]}</Text>
        </View>
      ) : null}
    </View>
  );
}

/* ---------- 带坐标轴的折线图（体能趋势用，支持多条线 + 参考带） ---------- */

export interface ChartSeries {
  /** null / undefined 表示当天没有数据，绘图时应断开而不是画到 0 */
  values: (number | null | undefined)[];
  color: string;
  label: string;
  area?: boolean;
  dashed?: boolean;
}

export function LineChart({
  series,
  labels,
  height = 140,
  zeroLine = false,
  band,
  yTicks = 3,
}: {
  series: ChartSeries[];
  labels: string[];
  height?: number;
  zeroLine?: boolean;
  band?: { from: number; to: number; color: string };
  yTicks?: number;
}) {
  const t = useTheme();
  const [w, setW] = React.useState(0);
  const gutter = 32; // 左侧留给 Y 轴数字
  const top = 8;
  const bottom = 18; // 底部留给日期
  const plotW = Math.max(0, w - gutter);
  const plotH = height - top - bottom;

  const all = series
    .flatMap((x) => x.values)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (zeroLine) all.push(0);
  if (band) all.push(band.from, band.to);

  if (!all.length) {
    return (
      <View style={{ height }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: t.text3, fontSize: T.caption }}>暂无数据</Text>
        </View>
      </View>
    );
  }

  let min = Math.min(...all);
  let max = Math.max(...all);
  if (max - min < 1e-6) {
    max = min + 1;
  }
  const padY = (max - min) * 0.08;
  min -= padY;
  max += padY;

  const span = max - min || 1;
  const n = Math.max(...series.map((x) => x.values.length), 1);
  const stepX = n > 1 ? plotW / (n - 1) : plotW;
  const yOf = (v: number) => top + plotH - ((v - min) / span) * plotH;
  const xOf = (i: number) => gutter + i * stepX;

  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => min + ((max - min) * i) / yTicks);
  // 小范围（例如负荷比 0.95–1.05）用整数刻度会全部显示成 1
  const tickText = (v: number) => {
    const spanV = max - min;
    if (spanV < 5) return v.toFixed(2);
    if (spanV < 20) return v.toFixed(1).replace(/\.0$/, '');
    return String(Math.round(v));
  };
  // 日期只标 4 个位置，避免挤在一起
  const labelIdx = labels.length
    ? Array.from(
        new Set([
          0,
          Math.floor((labels.length - 1) / 3),
          Math.floor(((labels.length - 1) * 2) / 3),
          labels.length - 1,
        ])
      )
    : [];

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height }}>
      {w > 0 ? (
        <Svg width={w} height={height}>
          {/* 参考带 */}
          {band ? (
            <Rect
              x={gutter}
              y={yOf(band.to)}
              width={plotW}
              height={Math.max(1, yOf(band.from) - yOf(band.to))}
              fill={alpha(band.color, 0.14)}
            />
          ) : null}

          {/* 横向网格 + Y 轴刻度 */}
          {ticks.map((v, i) => (
            <React.Fragment key={`y${i}`}>
              <Line
                x1={gutter}
                y1={yOf(v)}
                x2={w}
                y2={yOf(v)}
                stroke={t.border}
                strokeWidth={1}
                opacity={0.7}
              />
              <SvgText x={gutter - 6} y={yOf(v) + 4} fontSize={11} fill={t.text3} textAnchor="end">
                {tickText(v)}
              </SvgText>
            </React.Fragment>
          ))}

          {/* 0 线 */}
          {zeroLine && min < 0 && max > 0 ? (
            <Line
              x1={gutter}
              y1={yOf(0)}
              x2={w}
              y2={yOf(0)}
              stroke={t.text3}
              strokeWidth={1}
              strokeDasharray="3,3"
            />
          ) : null}

          {/* 曲线 */}
          {series.map((se, si) => {
            const finite = se.values
              .map((v, i) =>
                typeof v === 'number' && Number.isFinite(v) ? { v, i } : null
              )
              .filter((p): p is { v: number; i: number } => p !== null);
            if (finite.length < 2) return null;
            const d = finite
              .map((p, k) => `${k === 0 ? 'M' : 'L'}${xOf(p.i).toFixed(1)},${yOf(p.v).toFixed(1)}`)
              .join(' ');
            const continuous = se.values.every(
              (v) => typeof v === 'number' && Number.isFinite(v)
            );
            const areaD = continuous && se.values.length > 0
              ? `${d} L${xOf(se.values.length - 1).toFixed(1)},${top + plotH} L${gutter},${
                  top + plotH
                } Z`
              : '';
            const last = finite[finite.length - 1];
            return (
              <React.Fragment key={`s${si}`}>
                {se.area && areaD ? (
                  <Path d={areaD} fill={alpha(se.color, 0.14)} stroke="none" />
                ) : null}
                <Path
                  d={d}
                  stroke={se.color}
                  strokeWidth={2.4}
                  fill="none"
                  strokeDasharray={se.dashed ? '4,3' : undefined}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <Circle cx={xOf(last.i)} cy={yOf(last.v)} r={3} fill={se.color} />
              </React.Fragment>
            );
          })}

          {/* 底部日期 */}
          {labelIdx.map((idx) => (
            <SvgText
              key={`x${idx}`}
              x={xOf(idx)}
              y={height - 3}
              fontSize={11}
              fill={t.text3}
              textAnchor={idx === 0 ? 'start' : idx === labels.length - 1 ? 'end' : 'middle'}
            >
              {labels[idx]}
            </SvgText>
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

/** 图例 */
export function Legend({ items }: { items: { color: string; label: string; dashed?: boolean }[] }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 6 }}>
      {items.map((it) => (
        <View key={it.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View
            style={{
              width: 14,
              height: 3,
              borderRadius: 2,
              backgroundColor: it.color,
              opacity: it.dashed ? 0.5 : 1,
            }}
          />
          <Text style={{ color: t.text3, fontSize: T.micro + 0.5 }}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** 柱状图：带 0 基线和 Y 轴刻度，零值不再画成 2px「有一点」 */
export function Bars({
  values,
  labels,
  height = 110,
  color,
  highlightLast = true,
  partial,
}: {
  values: number[];
  labels?: string[];
  height?: number;
  color?: string;
  highlightLast?: boolean;
  /** 未完成周期（例如本周还没跑完）用空心柱表示 */
  partial?: boolean[];
}) {
  const t = useTheme();
  const s = useStyles();
  const fill = color || t.accent;
  const [w, setW] = React.useState(0);
  const gutter = 30;
  const topPad = 10;
  const bottomPad = 2;
  const plotH = Math.max(1, height - topPad - bottomPad);
  const max = Math.max(...values, 0) || 1;
  const n = values.length || 1;
  const gap = 4;
  const plotW = Math.max(0, w - gutter);
  const bw = Math.max(2, (plotW - gap * (n - 1)) / n);
  const yOf = (v: number) => topPad + plotH - (v / max) * plotH;
  const tickText = (v: number) => {
    if (max < 5) return v.toFixed(1).replace(/\.0$/, '');
    if (max < 20) return String(Math.round(v * 10) / 10);
    return String(Math.round(v));
  };

  return (
    <View>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height }}>
        {w > 0 ? (
          <Svg width={w} height={height}>
            {/* 0 基线 + 中值参考线 */}
            {[0, max / 2, max].map((v, i) => (
              <React.Fragment key={`g${i}`}>
                <Line
                  x1={gutter}
                  y1={yOf(v)}
                  x2={w}
                  y2={yOf(v)}
                  stroke={t.border}
                  strokeWidth={1}
                  opacity={i === 0 ? 1 : 0.6}
                />
                <SvgText
                  x={gutter - 4}
                  y={yOf(v) + 3.5}
                  fontSize={9}
                  fill={t.text3}
                  textAnchor="end"
                >
                  {tickText(v)}
                </SvgText>
              </React.Fragment>
            ))}
            {values.map((v, i) => {
              const bh = v > 0 ? Math.max(1, (v / max) * plotH) : 0;
              const isLast = highlightLast && i === values.length - 1;
              const isPartial = !!partial?.[i];
              return (
                <Rect
                  key={i}
                  x={gutter + i * (bw + gap)}
                  y={height - bottomPad - bh}
                  width={bw}
                  height={bh}
                  rx={bw > 6 ? 3 : 2}
                  fill={isPartial ? 'none' : isLast ? fill : alpha(fill, 0.45)}
                  stroke={isPartial ? fill : 'none'}
                  strokeWidth={isPartial ? 1.5 : 0}
                  strokeDasharray={isPartial ? '3,2' : undefined}
                />
              );
            })}
          </Svg>
        ) : null}
      </View>
      {labels && labels.length ? (
        labels.length === values.length ? (
          // 每根柱子都有自己的标签，避免只看得到「周一/周日」
          <View style={{ flexDirection: 'row', paddingLeft: gutter, marginTop: 4 }}>
            {labels.map((l, i) => (
              <Text
                key={`${l}-${i}`}
                numberOfLines={1}
                style={[s.lbl, { flex: 1, textAlign: 'center', fontSize: Math.min(10, T.micro) }]}
              >
                {l}
              </Text>
            ))}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
            <Text style={s.lbl}>{labels[0]}</Text>
            <Text style={s.lbl}>{labels[labels.length - 1]}</Text>
          </View>
        )
      ) : null}
      {partial?.some(Boolean) ? (
        <Text style={[s.lbl, { marginTop: 4 }]}>空心柱 = 本周还没跑完</Text>
      ) : null}
    </View>
  );
}

/** 年跑量热力图（GitHub 风格，按周分列） */
export function Heatmap({
  days,
  weeks = 26,
  cell = 10,
}: {
  days: Record<string, number>;
  weeks?: number;
  cell?: number;
}) {
  const t = useTheme();
  const s = useStyles();

  // 用「北京时间今天」+ UTC 正午构造网格：
  // 以前对本地午夜调 toISOString()，UTC+8 会把每个格子整体提前一天。
  const keyOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const todayStr = (() => {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date());
      const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
      return `${get('year')}-${get('month')}-${get('day')}`;
    } catch {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }
  })();
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const todayMs = Date.UTC(ty, (tm || 1) - 1, td || 1, 12);
  const dow = (new Date(todayMs).getUTCDay() + 6) % 7;
  const startMs = todayMs - dow * 86400000 - (weeks - 1) * 7 * 86400000;
  const todayKey = todayStr;

  const cols: { date: string; km: number; future: boolean; today: boolean }[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const ms = startMs + (w * 7 + d) * 86400000;
      const key = keyOf(ms);
      col.push({
        date: key,
        km: days[key] || 0,
        future: key > todayKey,
        today: key === todayKey,
      });
    }
    cols.push(col);
  }

  // 用主题强调色的 4 级透明度，任何主题下都协调
  const color = (km: number) => {
    if (!km) return t.cardInner;
    if (km < 5) return alpha(t.accent, 0.26);
    if (km < 10) return alpha(t.accent, 0.46);
    if (km < 20) return alpha(t.accent, 0.7);
    return t.accent;
  };
  const legend = [
    { label: '1–4', c: alpha(t.accent, 0.26) },
    { label: '5–9', c: alpha(t.accent, 0.46) },
    { label: '10–19', c: alpha(t.accent, 0.7) },
    { label: '20+', c: t.accent },
  ];

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {/* 月份刻度：只写数字，避免挤在一起 */}
          <View style={{ flexDirection: 'row', gap: 2.5, marginBottom: 3 }}>
            {cols.map((col, ci) => {
              const month = Number(col[0].date.slice(5, 7));
              const prev = ci > 0 ? Number(cols[ci - 1][0].date.slice(5, 7)) : null;
              return (
                <View key={`m${ci}`} style={{ width: cell }}>
                  {month !== prev ? (
                    <Text style={{ color: t.text3, fontSize: 8 }}>{month}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', gap: 2.5 }}>
            {cols.map((col, ci) => (
              <View key={ci} style={{ gap: 2.5 }}>
                {col.map((day, di) => (
                  <View
                    key={di}
                    style={{
                      width: cell,
                      height: cell,
                      borderRadius: 2.5,
                      backgroundColor: day.future ? 'transparent' : color(day.km),
                      borderWidth: day.future || day.today ? 1 : 0,
                      borderColor: day.today ? t.accent : t.border,
                    }}
                  />
                ))}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
        {legend.map((it) => (
          <View key={it.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: it.c }} />
            <Text style={s.lbl}>{it.label} km</Text>
          </View>
        ))}
        <Text style={s.lbl}>空心 = 未来</Text>
      </View>
    </View>
  );
}

/** GPS 轨迹（无底图，纯形状轮廓） */
export function TrackShape({
  points,
  height = 190,
}: {
  points: { lat: number; lon: number }[];
  height?: number;
}) {
  const t = useTheme();
  const [w, setW] = React.useState(0);
  if (!points.length) return <Text style={{ color: t.text3, fontSize: T.caption }}>无轨迹数据</Text>;

  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const spanLat = maxLat - minLat || 1e-6;
  const spanLon = maxLon - minLon || 1e-6;

  const pad = 10;
  const pts = points
    .map((p) => {
      const x = pad + ((p.lon - minLon) / spanLon) * (w - pad * 2);
      const y = height - pad - ((p.lat - minLat) / spanLat) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height }}>
      {w > 0 ? (
        <Svg width={w} height={height}>
          <Polyline
            points={pts}
            fill="none"
            stroke={t.accent}
            strokeWidth={2.6}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </Svg>
      ) : null}
    </View>
  );
}

/* ---------- 半圆仪表：给「状态值」这类有正负区间的数值一个刻度 ---------- */

export function Gauge({
  value,
  min = -30,
  max = 30,
  height = 158,
  color,
  zones,
  caption,
  format,
}: {
  value: number;
  min?: number;
  max?: number;
  height?: number;
  color?: string;
  zones?: { from: number; to: number; color: string }[];
  /** 数值下方的说明，只写定义和单位，不写结论 */
  caption?: string;
  format?: (v: number) => string;
}) {
  const t = useTheme();
  const [w, setW] = React.useState(0);
  const stroke = color || t.accent;
  const span = max - min || 1;
  const pct = (v: number) => Math.max(0, Math.min(1, (v - min) / span));
  const deg = (v: number) => 180 + pct(v) * 180;

  const cx = w / 2;
  const cy = height - 16;
  const r = Math.max(20, Math.min(w / 2 - 18, height - 30));
  const thickness = 11;
  const end = polar(cx, cy, r, deg(value));
  const shown = format ? format(value) : String(value);
  const over = value > max;
  const under = value < min;
  const clamped = over || under;

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height }}>
      {w > 0 ? (
        <Svg width={w} height={height}>
          {/* 底轨 */}
          <Path
            d={arcPath(cx, cy, r, 180, 360)}
            stroke={t.cardInner}
            strokeWidth={thickness}
            fill="none"
            strokeLinecap="round"
          />
          {/* 区间底色：只标刻度带，不写判断 */}
          {(zones || []).map((z, i) => (
            <Path
              key={i}
              d={arcPath(cx, cy, r, deg(z.from), deg(z.to))}
              stroke={alpha(z.color, t.dark ? 0.3 : 0.22)}
              strokeWidth={thickness}
              fill="none"
            />
          ))}
          {/* 当前值 */}
          {pct(value) > 0.004 ? (
            <Path
              d={arcPath(cx, cy, r, 180, deg(value))}
              stroke={stroke}
              strokeWidth={thickness}
              fill="none"
              strokeLinecap="round"
            />
          ) : null}
          <Circle
            cx={end.x}
            cy={end.y}
            r={6}
            fill={clamped ? t.bad : stroke}
            stroke={t.card}
            strokeWidth={2.5}
          />
          <SvgText
            x={cx}
            y={cy - r * 0.42}
            fontSize={36}
            fontWeight="600"
            fill={stroke}
            textAnchor="middle"
          >
            {shown}
          </SvgText>
          {caption ? (
            <SvgText x={cx} y={cy - r * 0.42 + 19} fontSize={11} fill={t.text3} textAnchor="middle">
              {caption}
            </SvgText>
          ) : null}
          <SvgText x={cx - r} y={cy + 13} fontSize={11} fill={t.text3} textAnchor="start">
            {format ? format(min) : min}
          </SvgText>
          <SvgText x={cx + r} y={cy + 13} fontSize={11} fill={t.text3} textAnchor="end">
            {format ? format(max) : max}
          </SvgText>
        </Svg>
      ) : null}
      {clamped ? (
        <Text
          style={{
            position: 'absolute',
            top: 0,
            right: 4,
            color: t.bad,
            fontSize: T.micro,
          }}
        >
          {over ? '↑' : '↓'} 超出刻度
        </Text>
      ) : null}
    </View>
  );
}

/* ---------- 环形进度：0–100 这类有明确满分的指标 ---------- */

export function Donut({
  value,
  max = 100,
  size = 108,
  thickness = 10,
  color,
  caption,
  format,
}: {
  value: number;
  max?: number;
  size?: number;
  thickness?: number;
  color?: string;
  caption?: string;
  format?: (v: number) => string;
}) {
  const t = useTheme();
  const stroke = color || t.accent;
  const c = size / 2;
  const r = (size - thickness) / 2 - 2;
  const frac = Math.max(0, Math.min(1, (max ? value / max : 0)));
  const over = value > max;
  const shown = format ? format(value) : String(Math.round(value));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={c} cy={c} r={r} stroke={t.cardInner} strokeWidth={thickness} fill="none" />
        {frac > 0.002 ? (
          <Path
            d={arcPath(c, c, r, -90, -90 + frac * 360)}
            stroke={stroke}
            strokeWidth={thickness}
            fill="none"
            strokeLinecap="round"
          />
        ) : null}
      </Svg>
      <Text style={{ color: over ? t.bad : stroke, fontSize: 30, fontWeight: '600', letterSpacing: -1, ...TNUM }}>
        {shown}{over ? '↑' : ''}
      </Text>
      {caption ? (
        <Text style={{ color: t.text3, fontSize: T.micro, marginTop: 1 }}>{caption}</Text>
      ) : null}
      {over ? (
        <Text style={{ color: t.bad, fontSize: T.micro }}>超出上限</Text>
      ) : null}
    </View>
  );
}

/* ---------- 分段环：把一个总量按构成拆开（睡眠分期等） ---------- */

export interface RingSegment {
  value: number;
  color: string;
  label?: string;
}

export function SegmentRing({
  segments,
  size = 108,
  thickness = 10,
  center,
  caption,
}: {
  segments: RingSegment[];
  size?: number;
  thickness?: number;
  center?: string;
  caption?: string;
}) {
  const t = useTheme();
  const c = size / 2;
  const r = (size - thickness) / 2 - 2;
  const total = segments.reduce((a, b) => a + Math.max(0, b.value), 0);
  const active = segments.filter((s) => s.value > 0).length;
  const gapDeg = total > 0 && active > 1 ? 1.6 : 0;
  // 间隙也占角度：先从总角度里扣掉，再按比例分，避免 4 段时比例被吃掉约 1.8%
  const usable = Math.max(0, 360 - gapDeg * Math.max(0, active - 1));
  let cursor = -90;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={c} cy={c} r={r} stroke={t.cardInner} strokeWidth={thickness} fill="none" />
        {total > 0
          ? segments.map((seg, i) => {
              const v = Math.max(0, seg.value);
              if (!v) return null;
              const sweep = (v / total) * usable;
              const from = cursor;
              const to = cursor + sweep;
              cursor = to + gapDeg;
              if (to <= from) return null;
              return (
                <Path
                  key={i}
                  d={arcPath(c, c, r, from, to)}
                  stroke={seg.color}
                  strokeWidth={thickness}
                  fill="none"
                />
              );
            })
          : null}
      </Svg>
      {center ? (
        <Text style={{ color: t.text, fontSize: 20, fontWeight: '600', letterSpacing: -0.5, ...TNUM }}>
          {center}
        </Text>
      ) : null}
      {caption ? (
        <Text style={{ color: t.text3, fontSize: T.micro, marginTop: 1 }}>{caption}</Text>
      ) : null}
    </View>
  );
}

/** 分段环的图例：色点 + 名称 + 数值 */
export function RingLegend({ items }: { items: { color: string; label: string; value: string }[] }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, gap: 7 }}>
      {items.map((it) => (
        <View key={it.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: it.color }} />
          <Text style={{ color: t.text2, fontSize: T.caption, flex: 1 }}>{it.label}</Text>
          <Text style={{ color: t.text, fontSize: T.caption, ...TNUM }}>{it.value}</Text>
        </View>
      ))}
    </View>
  );
}

/* ---------- 区间参照条：让一个数字带上「在什么范围里」的尺子 ---------- */

export function Bullet({
  label,
  value,
  min,
  max,
  color,
  band,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  color?: string;
  /** 浅色参考区间，例如负荷比的 0.8–1.3 */
  band?: { from: number; to: number };
  format?: (v: number) => string;
}) {
  const t = useTheme();
  const c = color || t.accent;
  const span = max - min || 1;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - min) / span) * 100));
  const f = format || ((v: number) => String(v));
  const clamped = value < min || value > max;

  return (
    <View style={{ marginTop: S.sm + 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text style={{ color: t.text2, fontSize: T.caption }}>{label}</Text>
        <Text style={{ color: t.text, fontSize: T.body2, fontWeight: '600', ...TNUM }}>{f(value)}</Text>
      </View>
      <View
        style={{
          height: 9,
          marginTop: 6,
          borderRadius: 5,
          backgroundColor: t.cardInner,
          overflow: 'hidden',
        }}
      >
        <View style={{ width: `${pct(value)}%`, height: '100%', borderRadius: 5, backgroundColor: c }} />
        {band ? (
          <View
            style={{
              position: 'absolute',
              left: `${pct(band.from)}%`,
              width: `${Math.max(0, pct(band.to) - pct(band.from))}%`,
              top: 0,
              bottom: 0,
              // 画在填充条上层，否则当前值会把参考区间的下沿盖住
              backgroundColor: alpha(t.good, t.dark ? 0.16 : 0.1),
              borderColor: alpha(t.good, 0.8),
              borderTopWidth: 1,
              borderBottomWidth: 1,
            }}
          />
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={{ color: t.text3, fontSize: T.micro, ...TNUM }}>{f(min)}</Text>
        {clamped ? (
          <Text style={{ color: t.bad, fontSize: T.micro }}>超出刻度</Text>
        ) : band ? (
          <Text style={{ color: t.text3, fontSize: T.micro }}>{`参考 ${f(band.from)}–${f(band.to)}`}</Text>
        ) : null}
        <Text style={{ color: t.text3, fontSize: T.micro, ...TNUM }}>{f(max)}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t: Theme) => ({
  ph: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lbl: { color: t.text3, fontSize: T.micro + 0.5 },
}));
