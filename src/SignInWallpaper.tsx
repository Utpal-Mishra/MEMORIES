import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

import { useAlbumWeather } from './WeatherScene';

const landscape = require('../assets/wicklow-lake.jpg') as ImageSourcePropType;
const precipitation = Array.from({ length: 32 }, (_, i) => ({
  left: `${(i * 53 + 8) % 100}%` as const,
  top: `${(i * 37 + 11) % 100}%` as const,
}));

export function useWallpaperMotion() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let active = true;
    let preferenceChanged = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (reduced) => {
      preferenceChanged = true;
      setAllowed(!reduced);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (active && !preferenceChanged) setAllowed(!reduced);
    }).catch(() => { /* Keep the wallpaper still if the preference is unavailable. */ });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return allowed;
}

export function SignInWallpaper({ playing }: { playing: boolean }) {
  const { scene } = useAlbumWeather();
  const drift = useRef(new Animated.Value(0)).current;
  const fall = useRef(new Animated.Value(0)).current;
  const night = scene === 'night' || scene === 'nightRain';
  const snow = scene === 'snow';
  const raining = scene === 'rain' || scene === 'nightRain';
  const wet = raining || snow;

  useEffect(() => {
    if (!playing) return;
    const timing = (toValue: number) => Animated.timing(drift, {
      toValue, duration: 22000, easing: Easing.inOut(Easing.sin), useNativeDriver: true,
    });
    const animation = Animated.loop(Animated.sequence([timing(1), timing(0)]), { resetBeforeIteration: false });
    animation.start();
    return () => animation.stop();
  }, [drift, playing]);

  useEffect(() => {
    if (!playing || !wet) return;
    const animation = Animated.loop(Animated.timing(fall, {
      toValue: 1, duration: snow ? 7200 : 2200, easing: Easing.linear, useNativeDriver: true,
    }));
    animation.start();
    return () => {
      animation.stop();
      fall.setValue(0);
    };
  }, [fall, playing, snow, wet]);

  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    aria-hidden style={styles.wallpaper}>
    <Animated.Image source={landscape} resizeMode="cover" style={[styles.image, {
      transform: [
        { scale: drift.interpolate({ inputRange: [0, 1], outputRange: [1.025, 1.105] }) },
        { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, 10] }) },
      ],
    }]} />
    <View style={[styles.shade, night && styles.night]} />
    {playing && wet && <Animated.View style={[StyleSheet.absoluteFill, {
      opacity: fall.interpolate({ inputRange: [0, 0.18, 0.82, 1], outputRange: [0, 1, 1, 0] }),
      transform: [{ translateY: fall.interpolate({ inputRange: [0, 1], outputRange: [-38, 65] }) }],
    }]}>
      {precipitation.map((position) => (
        <View key={position.left} style={[styles.raindrop, position, snow && styles.snowflake]} />
      ))}
    </Animated.View>}
  </View>;
}

const styles = StyleSheet.create({
  wallpaper: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  image: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  shade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(12, 32, 24, 0.49)' },
  night: { backgroundColor: 'rgba(6, 21, 28, 0.69)' },
  raindrop: {
    position: 'absolute', height: 26, width: 1, backgroundColor: 'rgba(235, 248, 244, 0.35)',
    transform: [{ rotate: '18deg' }],
  },
  snowflake: { height: 4, width: 4, borderRadius: 2, backgroundColor: 'rgba(255, 255, 255, 0.54)' },
});
