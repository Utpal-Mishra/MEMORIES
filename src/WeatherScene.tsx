import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Scene = 'clear' | 'cloud' | 'rain' | 'snow' | 'mist' | 'night' | 'nightRain' | 'fallback';
type Weather = { scene: Scene; label: string; temperature?: number };

const fallback: Weather = { scene: 'fallback', label: 'Ireland' };
const sky: Record<Scene, [string, string, string]> = {
  clear: ['#c5e4dd', '#f2db95', '#699c8e'],
  cloud: ['#cddbd5', '#e4e6cf', '#7b9f96'],
  rain: ['#acbfbd', '#d8e1d7', '#557e80'],
  snow: ['#dce8e7', '#fcfdf6', '#88a9a5'],
  mist: ['#d5e3d8', '#eff2e4', '#8eaba0'],
  night: ['#243e48', '#f1e8bc', '#426f73'],
  nightRain: ['#314952', '#b8ccd0', '#426f73'],
  fallback: ['#d8e5d4', '#f2e7c0', '#83a79a'],
};

export function weatherScene(code: number, isDay: number): Weather {
  const night = isDay === 0;
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { scene: 'snow', label: 'Snow' };
  if (code >= 51) return { scene: night ? 'nightRain' : 'rain', label: code >= 95 ? 'Thunderstorms' : 'Rain' };
  if (code === 45 || code === 48) return { scene: 'mist', label: 'Mist' };
  if (code >= 2) return { scene: night ? 'night' : 'cloud', label: 'Cloudy' };
  return { scene: night ? 'night' : 'clear', label: night ? 'Clear night' : 'Clear skies' };
}

export function WeatherScene() {
  const [weather, setWeather] = useState(fallback);
  useEffect(() => {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 5500);
    // A fixed reference for the Ireland map avoids collecting device or memory locations.
    const endpoint = 'https://api.open-meteo.com/v1/forecast?latitude=53.35&longitude=-6.26&current=temperature_2m,is_day,weather_code';
    void fetch(endpoint, { signal: abort.signal }).then(async (response) => {
      if (!response.ok) return;
      const { current } = await response.json();
      if (abort.signal.aborted || !Number.isFinite(current?.weather_code)) return;
      setWeather({ ...weatherScene(current.weather_code, current.is_day),
        temperature: Number.isFinite(current.temperature_2m) ? Math.round(current.temperature_2m) : undefined });
    }).catch(() => { /* The neutral scene is already visible. */ }).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); abort.abort(); };
  }, []);

  const [background, light, lake] = sky[weather.scene];
  const night = weather.scene === 'night' || weather.scene === 'nightRain';
  const raining = weather.scene === 'rain' || weather.scene === 'nightRain';
  const snowing = weather.scene === 'snow';
  const cloudy = ['cloud', 'mist', 'rain', 'snow', 'nightRain'].includes(weather.scene);
  const location = weather.scene === 'fallback' ? 'Ireland' : 'Dublin';

  return <View style={[styles.scene, { backgroundColor: background }]}>
    <View pointerEvents="none" style={StyleSheet.absoluteFill} importantForAccessibility="no-hide-descendants">
      <View style={[styles.sun, { backgroundColor: light }]} />
      {cloudy && <><View style={styles.cloud} /><View style={[styles.cloud, { right: '7%', top: 55, width: '28%' }]} /></>}
      <View style={[styles.hill, { backgroundColor: night ? '#4f7069' : '#8caf8d', left: '-11%' }]} />
      <View style={[styles.hill, { backgroundColor: night ? '#405d54' : '#709574', right: '-22%', bottom: -40 }]} />
      <View style={[styles.water, { backgroundColor: lake }]} />
      <View style={[styles.ripple, { right: '8%', bottom: 11 }]} />
      <View style={[styles.ripple, { right: '16%', bottom: 20, width: '14%' }]} />
      {!(raining || snowing || night) && <Text style={styles.birds}>⌁　⌁</Text>}
      {(raining || snowing) && Array.from({ length: 16 }, (_, i) =>
        <View key={i} style={[styles.drop, { left: `${6 + i * 5.7}%`, top: 14 + (i * 19) % 90 },
          snowing && styles.flake]} />)}
    </View>
    <View style={styles.label}>
      <Text style={styles.location}>{location}{weather.temperature === undefined ? '' : ` · ${weather.temperature}°C`}</Text>
      {weather.scene !== 'fallback' && <Text style={styles.condition}>{weather.label} · Open-Meteo</Text>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  scene: { minHeight: 144, padding: 14, borderRadius: 20, overflow: 'hidden', justifyContent: 'flex-end', alignItems: 'flex-start' },
  sun: { position: 'absolute', right: '16%', top: 18, width: 54, height: 54, borderRadius: 27, opacity: 0.9 },
  cloud: { position: 'absolute', top: 33, right: '23%', width: '37%', height: 22, borderRadius: 40, opacity: 0.62, backgroundColor: '#f0f2e9' },
  hill: { position: 'absolute', bottom: -32, width: '81%', height: 115, borderTopLeftRadius: 250, borderTopRightRadius: 200,
    transform: [{ rotate: '-5deg' }] },
  water: { position: 'absolute', right: '-6%', bottom: -27, width: '71%', height: 70, borderRadius: 130, transform: [{ rotate: '-4deg' }] },
  ripple: { position: 'absolute', height: 1, width: '22%', opacity: 0.55, backgroundColor: '#e7efdd' },
  birds: { position: 'absolute', right: '36%', top: 36, color: '#486c62', fontSize: 22, letterSpacing: 1 },
  drop: { position: 'absolute', width: 1, height: 13, backgroundColor: '#f1f9f6', opacity: 0.64, transform: [{ rotate: '24deg' }] },
  flake: { width: 4, height: 4, borderRadius: 2, opacity: 0.88 },
  label: { paddingVertical: 7, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#fcfdf4', gap: 2 },
  location: { color: '#173227', fontSize: 14, fontWeight: '700' },
  condition: { color: '#486252', fontSize: 11 },
});
