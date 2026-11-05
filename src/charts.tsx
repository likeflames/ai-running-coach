/* 轻量图表：SVG 手绘，零第三方图表依赖（与 Web 端思路一致） */
import React from 'react';
import { View, Text } from 'react-native';
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

function buildPath(points: number[], w: number, h: number, min: number, max: number) {
  if (!points.length) return '';
  const span = max - min || 1;
  const stepX = points.length > 1 ? w / (points.length - 1) : w;
  return points
    .map((v, i) => {
      const x = i * stepX;
      const y = h - ((v - min) / span) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/** 折线 / 面积图 */
export function Sparkline({
  values,
  height = 90,
  color,
  area = true,
  labels,
}: {
  values: number[];
  height?: number;
  color?: string;
  area?: boolean;
  labels?: string[];
}) {
  const t = useTheme();
  const s = useStyles();
  const stroke = color || t.accent;
  const [w, setW] = React.useState(0);
  const pad = 4;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const h = height - pad * 2;
  const line = buildPath(values, w, h, min, max);
  const areaPath = w > 0 && values.length > 0 ? `${line} L${w},${h} L0,${h} Z` : '';

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height }}>
      {w > 0 && values.length > 1 ? (
        <Svg width={w} height={height}>
          <Line x1={0} y1={h + pad} x2={w} y2={h + pad} stroke={t.border} strokeWidth={1} />
          {area ? (
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
  values: number[];
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

  const all = series.flatMap((x) => x.values).filter((v) => Number.isFinite(v));
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
                {Math.round(v)}
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
            const pts = se.values.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`);
            if (pts.length < 2) return null;
            const d = 'M' + pts.join(' L');
            const areaD = `${d} L${xOf(se.values.length - 1).toFixed(1)},${top + plotH} L${gutter},${
              top + plotH
            } Z`;
            return (
              <React.Fragment key={`s${si}`}>
                {se.area ? <Path d={areaD} fill={alpha(se.color, 0.14)} stroke="none" /> : null}
                <Path
                  d={d}
                  stroke={se.color}
                  strokeWidth={2.4}
                  fill="none"
                  strokeDasharray={se.dashed ? '4,3' : undefined}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <Circle
                  cx={xOf(se.values.length - 1)}
                  cy={yOf(se.values[se.values.length - 1])}
                  r={3}
                  fill={se.color}
                />
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

/** 柱状图 */
export function Bars({
  values,
  labels,
  height = 110,
  color,
  highlightLast = true,
}: {
  values: number[];
  labels?: string[];
  height?: number;
  color?: string;
  highlightLast?: boolean;
}) {
  const t = useTheme();
  const s = useStyles();
  const fill = color || t.accent;
  const [w, setW] = React.useState(0);
  const max = Math.max(...values, 1);
  const n = values.length || 1;
  const gap = 4;
  const bw = Math.max(2, (w - gap * (n - 1)) / n);

  return (
    <View>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height }}>
        {w > 0 ? (
          <Svg width={w} height={height}>
            {values.map((v, i) => {
              const bh = Math.max(2, (v / max) * (height - 4));
              const isLast = highlightLast && i === values.length - 1;
              return (
                <Rect
                  key={i}
                  x={i * (bw + gap)}
                  y={height - bh}
                  width={bw}
                  height={bh}
                  rx={bw > 6 ? 3 : 2}
                  fill={isLast ? fill : alpha(fill, 0.45)}
                />
              );
            })}
          </Svg>
        ) : null}
      </View>
      {labels && labels.length ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          <Text style={s.lbl}>{labels[0]}</Text>
          <Text style={s.lbl}>{labels[labels.length - 1]}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** 年跑量热力图（GitHub 风格，简化：按周分列） */
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
  const cols: { date: string; km: number }[][] = [];
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - weeks * 7 + 1);
  // 对齐到周一
  const dow = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dow);

  for (let w = 0; w < weeks; w++) {
    const col: { date: string; km: number }[] = [];
    for (let d = 0; d < 7; d++) {
      const cur = new Date(start);
      cur.setDate(start.getDate() + w * 7 + d);
      const key = cur.toISOString().slice(0, 10);
      col.push({ date: key, km: days[key] || 0 });
    }
    cols.push(col);
  }

  // 用主题强调色的 5 级透明度，任何主题下都协调
  const color = (km: number) => {
    if (!km) return t.cardInner;
    if (km < 5) return alpha(t.accent, 0.26);
    if (km < 10) return alpha(t.accent, 0.46);
    if (km < 20) return alpha(t.accent, 0.7);
    return t.accent;
  };

  return (
    <View style={{ flexDirection: 'row', gap: 2.5 }}>
      {cols.map((col, ci) => (
        <View key={ci} style={{ gap: 2.5 }}>
          {col.map((day, di) => (
            <View
              key={di}
              style={{ width: cell, height: cell, borderRadius: 2.5, backgroundColor: color(day.km) }}
            />
          ))}
        </View>
      ))}
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

/* ---------- 半圆仪表：给「状态（TSB）」这类有正负区间的数值一个刻度 ---------- */

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
          <Circle cx={end.x} cy={end.y} r={6} fill={stroke} stroke={t.card} strokeWidth={2.5} />

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
      <Text style={{ color: stroke, fontSize: 30, fontWeight: '600', letterSpacing: -1, ...TNUM }}>
        {shown}
      </Text>
      {caption ? (
        <Text style={{ color: t.text3, fontSize: T.micro, marginTop: 1 }}>{caption}</Text>
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
  const gapDeg = total > 0 ? 1.6 : 0;
  let cursor = -90;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={c} cy={c} r={r} stroke={t.cardInner} strokeWidth={thickness} fill="none" />
        {total > 0
          ? segments.map((seg, i) => {
              const v = Math.max(0, seg.value);
              if (!v) return null;
              const sweep = (v / total) * 360;
              const from = cursor + gapDeg / 2;
              const to = cursor + sweep - gapDeg / 2;
              cursor += sweep;
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
  /** 浅色参考区间，例如 ACWR 的 0.8–1.3 */
  band?: { from: number; to: number };
  format?: (v: number) => string;
}) {
  const t = useTheme();
  const c = color || t.accent;
  const span = max - min || 1;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - min) / span) * 100));
  const f = format || ((v: number) => String(v));

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
        {band ? (
          <View
            style={{
              position: 'absolute',
              left: `${pct(band.from)}%`,
              width: `${Math.max(0, pct(band.to) - pct(band.from))}%`,
              top: 0,
              bottom: 0,
              backgroundColor: alpha(t.good, t.dark ? 0.3 : 0.2),
            }}
          />
        ) : null}
        <View style={{ width: `${pct(value)}%`, height: '100%', borderRadius: 5, backgroundColor: c }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={{ color: t.text3, fontSize: T.micro, ...TNUM }}>{f(min)}</Text>
        {band ? (
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
