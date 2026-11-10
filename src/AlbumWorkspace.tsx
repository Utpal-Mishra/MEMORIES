import { useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'expo-crypto';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { categories, loadAlbum, saveVisit, today, validDate } from './album';
import type { AlbumData, Place, VisitInput } from './album';
import { PlaceMap } from './PlaceMap';

export function AlbumWorkspace({ client, onSignOut }: {
  client: SupabaseClient;
  onSignOut: () => void | Promise<void>;
}) {
  const [data, setData] = useState<AlbumData>();
  const [selectedId, setSelectedId] = useState<string>();
  const [tab, setTab] = useState('places');
  const [form, setForm] = useState<{ place?: Place }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const wide = useWindowDimensions().width >= 850;

  useEffect(() => {
    const abort = new AbortController();
    loadAlbum(client, abort.signal).then((album) => {
      if (!abort.signal.aborted) setData(album);
    }).catch(() => {
      if (!abort.signal.aborted) setError('Your album could not be loaded. Try again.');
    }).finally(() => {
      if (!abort.signal.aborted) setLoading(false);
    });
    return () => abort.abort();
  }, [client]);

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const album = await loadAlbum(client);
      setData(album);
    } catch {
      setData(undefined);
      setError('Your album could not be loaded. Check your connection and album access, then try again.');
    } finally {
      setLoading(false);
    }
  }

  const place = data?.places.find((item) => item.id === selectedId);
  const visibleVisits = data?.visits.filter((visit) => tab === 'memories' || visit.place_id === selectedId) ?? [];

  if (form && data) return <VisitEditor key={form.place?.id ?? 'new'} client={client} albumId={data.albumId}
    place={form.place} places={data.places}
    onCancel={() => { setForm(undefined); void refresh(); }}
    onSaved={async () => { setForm(undefined); setNotice('Your visit has been saved.'); await refresh(); }} />;

  return (
    <View style={styles.workspace}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={styles.heading}>Our places in Ireland</Text>
          <Text style={styles.muted}>A little map of the days we’ve shared.</Text>
        </View>
        <Button disabled={!data || loading} onPress={() => { setNotice(''); setForm({}); }}>Add memory</Button>
      </View>
      <View style={styles.tabs}>
        <Button secondary onPress={() => setTab('places')} selected={tab === 'places'}>Places</Button>
        <Button secondary onPress={() => setTab('memories')} selected={tab === 'memories'}>Memories</Button>
        <View style={{ flex: 1 }} />
        <Button secondary disabled={loading} onPress={refresh}>Refresh</Button>
        <Button secondary onPress={async () => {
          try { await onSignOut(); }
          catch { setError('Could not sign out. Check your connection and try again.'); }
        }}>Sign out</Button>
      </View>
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.muted}>{notice}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {loading && <ActivityIndicator color="#285342" accessibilityLabel="Loading places and visits" />}
      {data && (
        <View style={[styles.columns, wide && styles.wide]}>
          {tab === 'places' && <View style={wide ? { flex: 1 } : undefined}>
            <PlaceMap places={data.places} selectedId={selectedId} onSelect={setSelectedId} />
            <Text style={[styles.muted, { marginTop: 12 }]}>Choose a pin or a place below to open its visits.</Text>
            {data.places.length === 0 && <Text style={styles.empty}>Your first place starts with a memory.</Text>}
            <View style={styles.placeList}>
              {data.places.map((item) => (
                <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Open visits at ${item.name}`}
                  accessibilityState={{ selected: selectedId === item.id }} onPress={() => setSelectedId(item.id)}
                  style={[styles.place, item.id === selectedId && styles.selected]}>
                  <Text style={styles.placeTitle}>{item.name}</Text>
                  <Text style={styles.muted}>{data.visits.filter((visit) => visit.place_id === item.id).length} visits</Text>
                </Pressable>
              ))}
            </View>
          </View>}
          <View style={[styles.history, wide && { flex: 1 }]}>
            <View style={styles.header}>
              <Text accessibilityRole="header" style={styles.subheading}>{tab === 'memories' ? 'Our memories' : place?.name ?? 'Visit history'}</Text>
              {tab === 'places' && place && <Button onPress={() => setForm({ place })}>Add another visit</Button>}
            </View>
            {visibleVisits.length === 0 && <Text style={styles.empty}>
              {tab === 'places' && !place ? 'Select a saved place to see its story.' : 'The next little moment belongs here.'}
            </Text>}
            {visibleVisits.map((visit) => (
              <View key={visit.id} style={styles.visit}>
                <Text style={styles.date}>{new Date(visit.visited_on + 'T12:00:00Z').toLocaleDateString('en-IE',
                  { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
                {tab === 'memories' && <Button secondary onPress={() => { setSelectedId(visit.place_id); setTab('places'); }}>
                  {data.places.find((item) => item.id === visit.place_id)?.name ?? 'Open place'}
                </Button>}
                <Text style={styles.category}>{categories.find((item) => item.value === visit.category)?.label}</Text>
                <Text style={styles.brief}>{visit.brief}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
      {!data && !loading && <Button onPress={refresh}>Try loading again</Button>}
    </View>
  );
}

function VisitEditor({ client, albumId, place, places, onSaved, onCancel }: {
  client: SupabaseClient;
  albumId: string;
  place?: Place;
  places: Place[];
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(place?.name ?? '');
  const [latitude, setLatitude] = useState(String(place?.latitude ?? 53.35));
  const [longitude, setLongitude] = useState(String(place?.longitude ?? -6.26));
  const [date, setDate] = useState(today);
  const [brief, setBrief] = useState('');
  const [category, setCategory] = useState('days_out');
  const [requestId] = useState(randomUUID);
  const [attempt, setAttempt] = useState<VisitInput>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = busy || Boolean(attempt);

  async function submit() {
    const lat = Number(latitude.trim());
    const lon = Number(longitude.trim());
    if (!attempt && (!name.trim() || !brief.trim() || !validDate(date)
      || !latitude.trim() || !longitude.trim() || !Number.isFinite(lat) || !Number.isFinite(lon)
      || Math.abs(lat) > 90 || Math.abs(lon) > 180)) {
      setError('Add a place name, valid coordinates, a date in YYYY-MM-DD format and a short description.');
      return;
    }
    const payload = attempt ?? {
      request_id: requestId, target_album: albumId, existing_place: place?.id ?? null,
      place_name: place ? null : name.trim(), place_lat: place ? null : lat, place_lon: place ? null : lon,
      visit_date: date, visit_brief: brief.trim(), visit_category: category,
    };
    setAttempt(payload);
    setBusy(true);
    setError('');
    try {
      await saveVisit(client, payload);
      await onSaved();
    } catch {
      setError('Could not confirm the save. Retry safely, or return to the album and refresh to check your visits.');
      setBusy(false);
    }
  }

  return (
    <View style={styles.editor}>
      <Text accessibilityRole="header" style={styles.heading}>{place ? 'Another day here' : 'Add a memory'}</Text>
      <Text style={styles.muted}>{place ? place.name : 'Name the place and tap the map to position its pin. You can also enter coordinates.'}</Text>
      {!place && <PlaceMap places={places} onSelect={() => {}} draft={{
        latitude: Number(latitude), longitude: Number(longitude),
      }} onPick={locked ? undefined : (lat, lon) => { setLatitude(String(lat)); setLongitude(String(lon)); }} />}
      <Field label="Place name" value={name} onChange={setName} disabled={locked || Boolean(place)} maxLength={120} />
      {!place && <View style={styles.coordinateRow}>
        <View style={{ flex: 1 }}><Field label="Latitude" value={latitude} onChange={setLatitude} disabled={locked} /></View>
        <View style={{ flex: 1 }}><Field label="Longitude" value={longitude} onChange={setLongitude} disabled={locked} /></View>
      </View>}
      <Field label="Visit date (YYYY-MM-DD)" value={date} onChange={setDate} disabled={locked} maxLength={10} />
      <Text style={styles.label}>What kind of day?</Text>
      <View style={styles.tabs}>{categories.map((item) => <Button key={item.value} secondary
        disabled={locked} selected={category === item.value} onPress={() => setCategory(item.value)}>{item.label}</Button>)}</View>
      <Field label="Visit description" value={brief} onChange={setBrief} disabled={locked} multiline maxLength={5000} />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Button disabled={busy} onPress={submit}>{busy ? 'Saving…' : attempt ? 'Retry save' : 'Save visit'}</Button>
      <Button secondary disabled={busy} onPress={onCancel}>Back to album</Button>
    </View>
  );
}

function Field({ label, value, onChange, disabled, multiline, maxLength }: {
  label: string; value: string; onChange: (value: string) => void; disabled: boolean;
  multiline?: boolean; maxLength?: number;
}) {
  return <View style={{ gap: 7 }}>
    <Text style={styles.label}>{label}</Text>
    <TextInput accessibilityLabel={label} editable={!disabled} value={value} onChangeText={onChange}
      autoCorrect={multiline} autoCapitalize={multiline ? 'sentences' : 'none'}
      multiline={multiline} maxLength={maxLength}
      style={[styles.input, multiline && { minHeight: 110, textAlignVertical: 'top' }]} />
  </View>;
}

function Button({ children, disabled = false, secondary, selected, onPress }: PropsWithChildren<{
  disabled?: boolean; secondary?: boolean; selected?: boolean; onPress: () => void | Promise<void>;
}>) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled, selected }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [
      styles.button, secondary && styles.secondary, selected && styles.selected,
      (pressed || disabled) && { opacity: 0.5 },
    ]}><Text style={[styles.buttonText, secondary && { color: '#285342' }]}>{children}</Text></Pressable>;
}

const styles = StyleSheet.create({
  workspace: { gap: 19 },
  header: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  heading: { fontSize: 31, fontWeight: '700', letterSpacing: -1, color: '#173227', marginBottom: 6 },
  subheading: { flex: 1, fontSize: 23, fontWeight: '700', color: '#173227' },
  muted: { fontSize: 14, lineHeight: 21, color: '#486252' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  columns: { gap: 23 },
  wide: { flexDirection: 'row', alignItems: 'flex-start' },
  history: { gap: 15, padding: 20, borderRadius: 20, backgroundColor: '#fcfdf9', borderWidth: 1, borderColor: '#d2ded1' },
  placeList: { gap: 9, marginTop: 15 },
  place: { padding: 15, borderRadius: 13, borderWidth: 1, borderColor: '#d2ded1', backgroundColor: '#fcfdf9' },
  placeTitle: { fontSize: 17, fontWeight: '600', color: '#173227' },
  selected: { backgroundColor: '#d7e5cd', borderColor: '#6f916f' },
  empty: { color: '#526958', fontSize: 15, lineHeight: 23, paddingVertical: 18 },
  visit: { gap: 8, borderTopWidth: 1, borderTopColor: '#dce4d8', paddingTop: 18, paddingBottom: 7 },
  date: { color: '#173227', fontSize: 16, fontWeight: '600' },
  category: { fontSize: 12, color: '#55705b' },
  brief: { fontSize: 16, lineHeight: 25, color: '#284738' },
  editor: { maxWidth: 580, width: '100%', alignSelf: 'center', gap: 15, backgroundColor: '#fcfdf9', padding: 22, borderRadius: 22 },
  label: { color: '#284738', fontSize: 14, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#92a99a', borderRadius: 10, minHeight: 46, padding: 12, fontSize: 16, color: '#173227', backgroundColor: '#fff' },
  coordinateRow: { flexDirection: 'row', gap: 12 },
  error: { color: '#8b302c', fontSize: 14, lineHeight: 21 },
  button: { minHeight: 43, justifyContent: 'center', alignItems: 'center', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#285342' },
  secondary: { backgroundColor: '#e0eadb' },
  buttonText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
