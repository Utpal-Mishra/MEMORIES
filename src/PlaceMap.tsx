import { Component, useState } from 'react';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import geography from './data/ireland.json';
import type { Place } from './album';

const project = (latitude: number, longitude: number) => ({
  x: (longitude + 11.3) * 64, y: (55.8 - latitude) * 100,
});
const cities = [
  { name: 'Dublin', latitude: 53.35, longitude: -6.26 },
  { name: 'Cork', latitude: 51.9, longitude: -8.47 },
  { name: 'Galway', latitude: 53.27, longitude: -9.05 },
  { name: 'Belfast', latitude: 54.6, longitude: -5.93 },
];

type MapProps = {
  places: Place[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onPick?: (latitude: number, longitude: number) => void;
  draft?: { latitude: number; longitude: number };
};

class MapFallback extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <View style={styles.tools}>
      <Text style={styles.attribution}>Map unavailable. Use the place list or enter coordinates to continue.</Text>
      <Pressable accessibilityRole="button" onPress={() => this.setState({ failed: false })} style={styles.tool}>
        <Text>Retry map</Text>
      </Pressable>
    </View>;
  }
}

export function PlaceMap(props: MapProps) {
  return <MapFallback><IrelandMap {...props} /></MapFallback>;
}

function IrelandMap({ places, selectedId, onSelect, onPick, draft }: MapProps) {
  const [zoom, setZoom] = useState(1);
  const [size, setSize] = useState({ width: 400, height: 480 });
  const selected = places.find((place) => place.id === selectedId);
  const center = zoom > 1 && selected ? project(selected.latitude, selected.longitude) : { x: 200, y: 240 };
  const width = 400 / zoom;
  const height = 480 / zoom;
  const left = center.x - width / 2;
  const top = center.y - height / 2;

  function position(latitude: number, longitude: number) {
    const point = project(latitude, longitude);
    return { x: (point.x - left) / width * size.width, y: (point.y - top) / height * size.height };
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.map} onLayout={(event) => setSize(event.nativeEvent.layout)}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Svg width="100%" height="100%" viewBox={`${left} ${top} ${width} ${height}`}>
            {geography.map((part, index) => <Path key={index} d={part.path}
              fill={part.name === 'Ireland' ? '#c2d6b4' : '#d8e1cc'} stroke="#91aa86" strokeWidth={0.7 / zoom} />)}
          </Svg>
        </View>
        {cities.map((city) => {
          const point = position(city.latitude, city.longitude);
          return <Text key={city.name} pointerEvents="none" style={[styles.city, { left: point.x, top: point.y }]}>{city.name}</Text>;
        })}
        {!onPick && places.map((place) => {
          const point = position(place.latitude, place.longitude);
          if (point.x < 0 || point.x > size.width || point.y < 0 || point.y > size.height) return null;
          return <Pressable key={place.id} accessibilityRole="button" accessibilityLabel={`Open ${place.name} on map`}
            onPress={() => onSelect(place.id)}
            style={[styles.pinTarget, { left: point.x - 22, top: point.y - 22 }]}>
            <View style={[styles.pin, place.id === selectedId && styles.selectedPin]} />
          </Pressable>;
        })}
        {draft && Number.isFinite(draft.latitude) && Number.isFinite(draft.longitude) && (() => {
          const point = position(draft.latitude, draft.longitude);
          return <View pointerEvents="none" style={[styles.draft, { left: point.x - 8, top: point.y - 8 }]} />;
        })()}
        {onPick && <Pressable accessibilityRole="button" accessibilityLabel="Choose place location on map"
          style={StyleSheet.absoluteFill}
          onPress={(event) => {
            let { locationX, locationY } = event.nativeEvent;
            if (Platform.OS === 'web') {
              const pointer = event.nativeEvent as unknown as { clientX: number; clientY: number; detail: number };
              if (pointer.detail === 0) return;
              const target = event.currentTarget as unknown as {
                getBoundingClientRect: () => { left: number; top: number };
              };
              const bounds = target.getBoundingClientRect();
              locationX = pointer.clientX - bounds.left;
              locationY = pointer.clientY - bounds.top;
            }
            if (!Number.isFinite(locationX) || !Number.isFinite(locationY)) return;
            onPick(
              Number((55.8 - (top + locationY / size.height * height) / 100).toFixed(5)),
              Number(((left + locationX / size.width * width) / 64 - 11.3).toFixed(5)),
            );
          }} />}
      </View>
      <View style={styles.tools}>
        <Text style={styles.attribution}>Map data · Natural Earth</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" disabled={zoom === 1}
          onPress={() => setZoom((current) => Math.max(1, current / 2))} style={styles.tool}><Text>−</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" disabled={zoom === 4}
          onPress={() => setZoom((current) => Math.min(4, current * 2))} style={styles.tool}><Text>+</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => setZoom(1)} style={styles.tool}><Text>Ireland</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { borderRadius: 20, overflow: 'hidden', backgroundColor: '#e4efed', borderWidth: 1, borderColor: '#d4dfd5' },
  map: { width: '100%', aspectRatio: 400 / 480, overflow: 'hidden' },
  city: { position: 'absolute', fontSize: 11, color: '#526958', marginLeft: 7, marginTop: 5 },
  pinTarget: { position: 'absolute', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pin: { width: 15, height: 15, borderRadius: 9, backgroundColor: '#3e7257', borderWidth: 3, borderColor: '#fff' },
  selectedPin: { width: 21, height: 21, borderRadius: 12, backgroundColor: '#173f2d' },
  draft: { position: 'absolute', width: 16, height: 16, borderRadius: 8, borderWidth: 3, borderColor: '#fff', backgroundColor: '#875838' },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 9, backgroundColor: '#f3f7ef' },
  attribution: { flex: 1, fontSize: 10, color: '#526958' },
  tool: { minWidth: 36, minHeight: 36, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#fff' },
});
