import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

export const supabase = url && key ? createClient(url, key, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: false,
    persistSession: false,
  },
}) : null;

export function trackNativeSession() {
  if (Platform.OS === 'web' || !supabase) return;

  const client = supabase;
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') void client.auth.startAutoRefresh();
    else void client.auth.stopAutoRefresh();
  });

  return () => {
    subscription.remove();
    void client.auth.stopAutoRefresh();
  };
}
