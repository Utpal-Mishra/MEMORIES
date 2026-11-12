import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { signPhotos, signedPhotoLifetime } from './photos';

export type GalleryPhoto = { path: string; title: string; date: string; visitId: string };

export function PhotoGallery({ client, photos, onOpen, onRemove }: {
  client: SupabaseClient;
  photos: GalleryPhoto[];
  onOpen?: (visitId: string) => void;
  onRemove?: (path: string) => Promise<void>;
}) {
  const [limit, setLimit] = useState(24);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [removal, setRemoval] = useState<string>();
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const visible = photos.slice(0, limit);
  const pathKey = visible.map((photo) => photo.path).join('\n');

  useEffect(() => {
    if (!pathKey) return;
    let active = true;
    const paths = pathKey.split('\n');
    async function load() {
      try {
        const next = await signPhotos(client, paths);
        if (active) {
          setUrls(next);
          setFailed(new Set());
        }
      } catch {
        if (active) setUrls({});
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    const timer = setInterval(load, (signedPhotoLifetime - 30) * 1000);
    return () => { active = false; clearInterval(timer); };
  }, [client, pathKey, retry]);

  async function confirmRemoval(path: string) {
    if (!onRemove || removing) return;
    setRemoving(true);
    setError('');
    try {
      await onRemove(path);
      setRemoval(undefined);
    } catch {
      setError('The photo could not be removed. Try again.');
    } finally {
      setRemoving(false);
    }
  }

  if (photos.length === 0) return <Text style={styles.empty}>Photos you add to a visit will appear here.</Text>;

  return <View style={{ gap: 12 }}>
    <View style={styles.wall}>
      {visible.map((photo) => {
        const uri = !failed.has(photo.path) ? urls[photo.path] : undefined;
        const frame = <View style={styles.paper}>
          {uri ? <Image source={{ uri }} style={styles.photo} resizeMode="cover"
            accessible accessibilityLabel={`Photo from ${photo.title}`}
            onError={() => setFailed((current) => new Set(current).add(photo.path))} />
            : <View style={[styles.photo, styles.placeholder]}>
              <Text style={styles.empty}>{loading ? 'Loading photo…' : 'Photo unavailable'}</Text>
            </View>}
          <Text numberOfLines={2} style={styles.title}>{photo.title}</Text>
          <Text style={styles.date}>{photo.date}</Text>
        </View>;
        return <View key={photo.path} style={styles.card}>
          {onOpen ? <Pressable accessibilityRole="button" accessibilityLabel={`Open photo visit at ${photo.title}`}
            onPress={() => onOpen(photo.visitId)}>{frame}</Pressable> : frame}
          {onRemove && (removal === photo.path
            ? <View style={styles.actions}>
              <Pressable accessibilityRole="button" disabled={removing} onPress={() => void confirmRemoval(photo.path)}>
                <Text style={styles.remove}>{removing ? 'Removing…' : 'Confirm removal'}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={removing} onPress={() => setRemoval(undefined)}>
                <Text style={styles.action}>Cancel</Text>
              </Pressable>
            </View>
            : <Pressable accessibilityRole="button" disabled={removing} onPress={() => { setRemoval(photo.path); setError(''); }}>
              <Text style={styles.remove}>Remove photo</Text>
            </Pressable>)}
        </View>;
      })}
    </View>
    {error ? <Text accessibilityRole="alert" style={styles.remove}>{error}</Text> : null}
    {!loading && visible.some((photo) => !urls[photo.path] || failed.has(photo.path)) &&
      <Pressable accessibilityRole="button" onPress={() => { setLoading(true); setRetry((n) => n + 1); }}>
        <Text style={styles.action}>Retry loading photos</Text>
      </Pressable>}
    {limit < photos.length && <Pressable accessibilityRole="button" onPress={() => setLimit((n) => n + 24)}>
      <Text style={styles.action}>Show more photos</Text>
    </Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  wall: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' },
  card: { flexGrow: 1, flexBasis: 195, maxWidth: 275 },
  paper: { backgroundColor: '#fffdf6', borderColor: '#d6dfcc', borderWidth: 1, borderRadius: 4, padding: 9, paddingBottom: 14, gap: 7,
    shadowColor: '#294b37', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  photo: { width: '100%', aspectRatio: 1.18, backgroundColor: '#dae6d6', borderRadius: 2 },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  title: { color: '#173227', fontSize: 17, fontWeight: '600' },
  date: { color: '#486252', fontSize: 13 },
  empty: { color: '#486252', fontSize: 14 },
  action: { color: '#285342', fontWeight: '600', paddingVertical: 8 },
  remove: { color: '#87392d', fontWeight: '600', paddingVertical: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});
