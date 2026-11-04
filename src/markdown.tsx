/**
 * 轻量 Markdown 渲染器 —— 只覆盖模型实际会输出的那些写法。
 *
 * 为什么不用现成库：react-native-markdown-display 这类包依赖一串解析器和
 * 额外主题层，为了几个语法引进来，出包风险跟自己写差不多；
 * 而模型输出高度可控（标题、粗体、列表、表格、行内代码），自己写反而更贴 iOS 排版。
 *
 * 手机竖屏没法看横向表格，所以表格转成「左侧标签 + 右侧取值」的两列行。
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { S, T, TNUM, type Theme } from './theme';
import { useTheme } from './theme-provider';

type Block =
  | { kind: 'blank' }
  | { kind: 'h'; level: number; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'li'; text: string; marker: string }
  | { kind: 'hr' }
  | { kind: 'table'; head: string[]; rows: string[][] };

/** 把正文切成块 */
function parse(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: Block[] = [];
  let i = 0;

  const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
  const isTableSep = (l: string) => /^\s*\|[\s:|-]+\|\s*$/.test(l);
  const cells = (l: string) =>
    l
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();

    if (!line) {
      out.push({ kind: 'blank' });
      i++;
      continue;
    }

    // 表格：连续以 | 开头的行
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(cells(lines[i]));
        i++;
      }
      out.push({ kind: 'table', head, rows });
      continue;
    }

    // 分隔线
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(line)) {
      out.push({ kind: 'hr' });
      i++;
      continue;
    }

    // 标题
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      out.push({ kind: 'h', level: h[1].length, text: h[2] });
      i++;
      continue;
    }

    // 无序列表
    const ul = line.match(/^[-*+]\s+(.*)$/);
    if (ul) {
      out.push({ kind: 'li', text: ul[1], marker: '•' });
      i++;
      continue;
    }

    // 有序列表，保留原序号
    const ol = line.match(/^(\d+)[.)]\s+(.*)$/);
    if (ol) {
      out.push({ kind: 'li', text: ol[2], marker: `${ol[1]}.` });
      i++;
      continue;
    }

    // 引用，去掉 > 当普通段落
    out.push({ kind: 'p', text: line.replace(/^>\s?/, '') });
    i++;
  }

  return out;
}

/** 行内标记：**粗体**、`代码`、*斜体* */
function inline(text: string, t: Theme, k: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) {
      nodes.push(
        <Text key={`${k}i${n++}`} style={[styles.bold, { color: t.text }]}>
          {tok.slice(2, -2)}
        </Text>
      );
    } else if (tok.startsWith('`')) {
      nodes.push(
        <Text key={`${k}i${n++}`} style={[styles.code, { color: t.text, backgroundColor: t.bgSoft }]}>
          {tok.slice(1, -1)}
        </Text>
      );
    } else {
      nodes.push(
        <Text key={`${k}i${n++}`} style={styles.italic}>
          {tok.slice(1, -1)}
        </Text>
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ text, compact }: { text: string; compact?: boolean }) {
  const t = useTheme();
  const blocks = React.useMemo(() => parse(text), [text]);

  // 连续空行只留一个，块之间靠 gap 控制节奏
  const clean = React.useMemo(() => blocks.filter((b, idx) => !(b.kind === 'blank' && blocks[idx - 1]?.kind === 'blank')), [blocks]);

  return (
    <View style={{ gap: compact ? 6 : 9 }}>
      {clean.map((b, idx) => {
        const key = `b${idx}`;

        if (b.kind === 'blank') return <View key={key} style={{ height: 1 }} />;

        if (b.kind === 'hr') return <View key={key} style={[styles.hr, { backgroundColor: t.border }]} />;

        if (b.kind === 'h') {
          const size = b.level <= 2 ? T.body + 1.5 : T.body;
          return (
            <Text key={key} style={[styles.heading, { fontSize: size, color: t.text }]}>
              {inline(b.text, t, key)}
            </Text>
          );
        }

        if (b.kind === 'li') {
          return (
            <View key={key} style={styles.liRow}>
              <Text style={[styles.marker, { color: t.text3, fontSize: compact ? T.micro + 2 : T.body2 }]}>
                {b.marker}
              </Text>
              <Text style={[styles.liText, { color: t.text, fontSize: compact ? T.caption + 1 : T.body }]}>
                {inline(b.text, t, key)}
              </Text>
            </View>
          );
        }

        if (b.kind === 'table') {
          return (
            <View key={key} style={[styles.table, { borderColor: t.border }]}>
              {b.rows.map((row, ri) => (
                <View
                  key={`${key}r${ri}`}
                  style={[
                    styles.tRow,
                    ri > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border } : null,
                  ]}
                >
                  <Text style={[styles.tKey, { color: t.text2 }]} numberOfLines={2}>
                    {row[0] || ''}
                  </Text>
                  <Text style={[styles.tVal, { color: t.text }]}>{row.slice(1).join(' · ')}</Text>
                </View>
              ))}
            </View>
          );
        }

        return (
          <Text
            key={key}
            style={[styles.p, { color: t.text, fontSize: compact ? T.caption + 1 : T.body + 0.5 }]}
          >
            {inline(b.text, t, key)}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bold: { fontWeight: '600' },
  italic: { fontStyle: 'italic' },
  code: { fontFamily: 'Menlo', fontSize: 13, paddingHorizontal: 3, borderRadius: 3 },
  heading: { fontWeight: '600', letterSpacing: -0.2, marginTop: 2 },
  p: { lineHeight: 24 },
  liRow: { flexDirection: 'row', gap: 8, paddingLeft: 2 },
  marker: { lineHeight: 24, minWidth: 14, ...TNUM },
  liText: { flex: 1, lineHeight: 24 },
  hr: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  table: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, overflow: 'hidden' },
  tRow: { flexDirection: 'row', gap: 10, paddingVertical: 8, paddingHorizontal: 10 },
  tKey: { width: 88, fontSize: T.caption, lineHeight: 19 },
  tVal: { flex: 1, fontSize: T.caption + 1, lineHeight: 20, ...TNUM },
});
