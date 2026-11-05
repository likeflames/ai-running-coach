import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Screen } from '../../../src/ui';
import { S, T, R, alpha, type Theme } from '../../../src/theme';
import { makeStyles, useTheme } from '../../../src/theme-provider';
import TrainingView from '../../../src/views/TrainingView';
import RaceView from '../../../src/views/RaceView';

type Tab = 'training' | 'race';

/** 训练 + 比赛合成一个主标签，页内切换，不再占两个底部标签。 */
export default function PlanScreen() {
  const t = useTheme();
  const s = useStyles();
  const [tab, setTab] = React.useState<Tab>('training');
  const [reloadKey, setReloadKey] = React.useState(0);

  return (
    <Screen>
      <View style={s.head}>
        <View style={s.segment}>
          {([
            ['training', '训练课表'],
            ['race', '比赛策略'],
          ] as [Tab, string][]).map(([key, label]) => {
            const active = tab === key;
            return (
              <Pressable
                key={key}
                onPress={() => setTab(key)}
                style={[s.segItem, active && { backgroundColor: alpha(t.accent, t.dark ? 0.22 : 0.14) }]}
              >
                <Text style={[s.segText, active && { color: t.accent, fontWeight: '600' }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable onPress={() => setReloadKey((k) => k + 1)} hitSlop={12} style={s.refresh}>
          <Text style={s.refreshText}>⟳</Text>
        </Pressable>
      </View>

      {tab === 'training' ? <TrainingView reloadKey={reloadKey} /> : <RaceView reloadKey={reloadKey} />}
    </Screen>
  );
}

const useStyles = makeStyles((t: Theme) => ({
  head: { flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingTop: S.xs, paddingBottom: S.sm },
  segment: {
    flex: 1,
    flexDirection: 'row',
    padding: 3,
    borderRadius: R.pill,
    backgroundColor: t.cardInner,
  },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: R.pill },
  segText: { color: t.text2, fontSize: T.caption + 1 },
  refresh: { paddingHorizontal: 8, paddingVertical: 4 },
  refreshText: { color: t.accent, fontSize: 22, lineHeight: 26 },
}));
