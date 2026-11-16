import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { dateIdeas } from './dublinIdeas';
import type { DateIdea } from './dublinIdeas';

export function DateIdeas({ canSave, onVisit }: {
  canSave: boolean;
  onVisit: (idea: DateIdea) => void;
}) {
  const [failedSource, setFailedSource] = useState<string>();

  async function openSource(idea: DateIdea) {
    setFailedSource(undefined);
    try {
      await Linking.openURL(idea.sourceUrl);
    } catch {
      setFailedSource(idea.sourceUrl);
    }
  }

  return <View style={styles.list}>
    <Text accessibilityRole="header" style={styles.heading}>Dublin date ideas</Text>
    {dateIdeas.map((idea) => <View key={idea.sourceUrl} style={styles.card}>
      <Text style={styles.area}>{idea.area}</Text>
      <Text accessibilityRole="header" aria-level={3} style={styles.title}>{idea.name}</Text>
      <Text style={styles.description}>{idea.description}</Text>
      <View style={styles.actions}>
        <Pressable accessibilityRole="link" onPress={() => void openSource(idea)} style={styles.source}>
          <Text style={styles.sourceLabel}>{idea.sourceLabel}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`We went here: ${idea.name}`}
          accessibilityState={{ disabled: !canSave }} disabled={!canSave} onPress={() => onVisit(idea)}
          style={[styles.button, !canSave && styles.disabled]}>
          <Text style={styles.buttonText}>We went here</Text>
        </Pressable>
      </View>
      {failedSource === idea.sourceUrl &&
        <Text accessibilityRole="alert" style={styles.description} selectable>{idea.sourceUrl}</Text>}
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  heading: { color: '#173227', fontSize: 23, fontWeight: '700' },
  card: { gap: 7, padding: 17, borderRadius: 14, borderWidth: 1, borderColor: '#d2ded1', backgroundColor: '#fcfdf9' },
  area: { fontSize: 13, color: '#486252' },
  title: { fontSize: 18, fontWeight: '700', color: '#173227' },
  description: { fontSize: 14, color: '#284738', lineHeight: 21 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  source: { minHeight: 44, justifyContent: 'center' },
  sourceLabel: { fontSize: 14, color: '#285342', textDecorationLine: 'underline' },
  button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#285342' },
  buttonText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  disabled: { opacity: 0.5 },
});
