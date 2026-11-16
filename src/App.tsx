import { createContext, useContext, useEffect, useState } from 'react';
import { useFonts } from 'expo-font';
import type { PropsWithChildren } from 'react';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import {
  ActivityIndicator, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, useWindowDimensions, View,
} from 'react-native';

import { supabase, trackNativeSession } from './supabase';
import { AlbumWorkspace } from './AlbumWorkspace';
import { SignInWallpaper, useWallpaperMotion } from './SignInWallpaper';

const signInFonts = {
  BodoniDisplay: require('../assets/fonts/BodoniModa-Display.ttf') as number,
  BodoniText: require('../assets/fonts/BodoniModa-Text.ttf') as number,
  BodoniStrong: require('../assets/fonts/BodoniModa-Strong.ttf') as number,
};

const SignInTypography = createContext(false);

type PairingState =
  | 'owner_ready' | 'owner_waiting' | 'partner_waiting' | 'partner_ready'
  | 'active' | 'unavailable';

const pairingCopy: Record<PairingState, { title: string; detail: string }> = {
  owner_ready: {
    title: 'Start your shared album',
    detail: 'Create an invitation code and share it privately with your partner.',
  },
  owner_waiting: {
    title: 'Waiting for your partner',
    detail: 'Your partner can join with their verified email and the invitation code. The code expires after 24 hours.',
  },
  partner_waiting: {
    title: 'Your album is waiting',
    detail: 'Ask your partner to create and share an invitation code, then check again.',
  },
  partner_ready: {
    title: 'Join your shared album',
    detail: 'Enter the invitation code your partner shared with you.',
  },
  active: {
    title: 'Your album is ready',
    detail: 'Both of you are connected. Your memories have a place to call home.',
  },
  unavailable: {
    title: 'Album access unavailable',
    detail: 'Sign in with the email set up for your album, or check with the person who set it up.',
  },
};

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    const stopTracking = trackNativeSession();
    return () => {
      subscription.unsubscribe();
      stopTracking?.();
    };
  }, []);

  if (!session || !supabase) {
    return <SignInPage>
      <View style={[styles.card, styles.signInCard]}>
        {!supabase ? <>
          <Heading level={2} onWallpaper>Album setup required</Heading>
          <SignInDetail>Connect the app to its Supabase project to enable sign-in.</SignInDetail>
        </> : session === undefined
          ? <ActivityIndicator accessibilityLabel="Loading album" color="#285342" />
          : <SignIn client={supabase} />}
      </View>
    </SignInPage>;
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <StatusBar barStyle="dark-content" />
      <View style={styles.frame}>
        <View style={styles.brand}>
          <Text style={styles.brandName}>For Her</Text>
          <View style={styles.brandMark} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        </View>
        <Pairing key={session.user.id} client={supabase} />
      </View>
    </ScrollView>
  );
}

function SignInPage({ children }: PropsWithChildren) {
  const { width } = useWindowDimensions();
  const [fontLoaded] = useFonts(signInFonts);
  const [paused, setPaused] = useState(false);
  const motionAllowed = useWallpaperMotion();
  const titleSize = Math.min(108, Math.max(56, width * 0.17));

  return <SignInTypography.Provider value={fontLoaded}><View style={styles.signInPage}>
    <StatusBar barStyle="light-content" />
    <SignInWallpaper playing={motionAllowed && !paused} />
    <ScrollView contentContainerStyle={[styles.page, styles.signInContent]} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" aria-level={1} style={[styles.signInBrand, fontLoaded && styles.displayFont, {
        fontSize: titleSize, lineHeight: titleSize * 1.15, letterSpacing: titleSize * 0.075,
      }]}>For Her</Text>
      {children}
      {motionAllowed && <Pressable accessibilityRole="button" onPress={() => setPaused(!paused)}
        style={styles.wallpaperControl}>
        <Text style={[styles.wallpaperControlText, fontLoaded && styles.strongFont]}>{paused ? 'Play wallpaper' : 'Pause wallpaper'}</Text>
      </Pressable>}
    </ScrollView>
  </View></SignInTypography.Provider>;
}

function SignIn({ client }: { client: SupabaseClient }) {
  const bodoni = useContext(SignInTypography);
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [setup, setSetup] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const address = email.trim().toLowerCase();
  const validAddress = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);

  async function requestCode() {
    if (!validAddress) {
      setError('Enter the email address set up for your album.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const { error: authError } = await client.auth.signInWithOtp({
        email: address, options: { shouldCreateUser: false },
      });
      if (isAuthRetryableFetchError(authError)) throw authError;
      // Use the same response for registered and unknown addresses.
      setSentTo(address);
      setCode('');
    } catch {
      setError('The sign-in service could not be reached. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (setup && !validAddress) {
      setError('Enter the email address set up for your album.');
      return;
    }
    if (!/^(?:\d{6}|\d{8})$/.test(code)) {
      setError('Enter the six- or eight-digit code from your email.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const { error: authError } = await client.auth.verifyOtp({
        email: setup ? address : sentTo, token: code, type: setup ? 'invite' : 'email',
      });
      if (authError) setError('That code could not be verified. Check the email and code, then try again.');
    } catch {
      setError('The sign-in service could not be reached. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function changeMode(nextSetup: boolean) {
    setSetup(nextSetup);
    setSentTo('');
    setCode('');
    setError('');
  }

  return (
    <>
      <Heading level={2} onWallpaper>{setup ? 'Set up your sign-in' : sentTo ? 'Check your email' : 'Open your album'}</Heading>
      <SignInDetail>
        {setup ? 'Use the setup code in the email that invited you to For Her.'
          : sentTo ? 'If that address is set up for the album, you’ll receive a one-time code.'
          : 'Enter your email to get a one-time sign-in code.'}
      </SignInDetail>
      {!sentTo && (
        <>
          <Text style={[styles.label, styles.signInText, bodoni && styles.strongFont]}>Email address</Text>
          <TextInput
            accessibilityLabel="Email address" autoCapitalize="none" autoComplete="email"
            autoCorrect={false} editable={!busy} keyboardType="email-address" onChangeText={setEmail}
            style={[styles.input, bodoni && styles.readingFont]} value={email}
          />
        </>
      )}
      {(setup || sentTo) ? (
        <>
          <Text style={[styles.label, styles.signInText, bodoni && styles.strongFont]}>{setup ? 'Email setup code' : 'Email sign-in code'}</Text>
          <TextInput
            accessibilityLabel={setup ? 'Email setup code' : 'Email sign-in code'}
            autoComplete="one-time-code" editable={!busy} keyboardType="number-pad" maxLength={8}
            onChangeText={setCode} style={[styles.input, bodoni && styles.readingFont]} value={code}
            onSubmitEditing={() => { if (!busy) void verifyCode(); }}
          />
          <Action disabled={busy} onPress={verifyCode}>{busy ? 'Please wait…' : 'Verify and sign in'}</Action>
          {!setup && <Action disabled={busy} onPress={requestCode} secondary>Request a new code</Action>}
          <Action disabled={busy} onPress={() => changeMode(false)} secondary>
            {setup ? 'Back to sign-in' : 'Use a different email'}
          </Action>
        </>
      ) : (
        <>
          <Action disabled={busy} onPress={requestCode}>{busy ? 'Please wait…' : 'Send sign-in code'}</Action>
          <Action disabled={busy} onPress={() => changeMode(true)} secondary>Use first-time setup code</Action>
        </>
      )}
      <ErrorMessage message={error} />
    </>
  );
}

function Pairing({ client }: { client: SupabaseClient }) {
  const [state, setState] = useState<PairingState>();
  const [invite, setInvite] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const abort = new AbortController();
    async function load() {
      try {
        const { data, error: loadError } = await client.rpc('album_status').abortSignal(abort.signal);
        if (abort.signal.aborted) return;
        if (loadError || !Object.hasOwn(pairingCopy, data)) throw new Error('Invalid album status');
        setState(data);
      } catch {
        if (!abort.signal.aborted) setError('Could not check your album. Try again.');
      } finally {
        if (!abort.signal.aborted) setBusy(false);
      }
    }
    void load();
    return () => abort.abort();
  }, [client]);

  async function refresh() {
    const { data, error: loadError } = await client.rpc('album_status');
    if (loadError || !Object.hasOwn(pairingCopy, data)) throw new Error('Invalid album status');
    setState(data);
    if (data !== 'owner_waiting') setInvite('');
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch {
      setError('Could not complete that action. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function issue() {
    return run(async () => {
      const { data, error: issueError } = await client.rpc('issue_album_invite');
      if (issueError || typeof data !== 'string') throw new Error('Invalid invitation');
      setInvite(data);
      setState('owner_waiting');
    });
  }

  function revoke() {
    return run(async () => {
      const { error: revokeError } = await client.rpc('revoke_album_invite');
      if (revokeError) throw revokeError;
      setInvite('');
      setState('owner_ready');
    });
  }

  function accept() {
    if (!/^[0-9a-f]{32}$/i.test(code.trim())) {
      setError('Enter the full invitation code shared by your partner.');
      return;
    }
    return run(async () => {
      const { data, error: acceptError } = await client.rpc('accept_album_invite', { invite_code: code });
      if (acceptError) throw acceptError;
      await refresh();
      if (!data) setError('That invitation is invalid or has expired. Ask your partner for a new code.');
    });
  }

  const copy = state ? pairingCopy[state] : undefined;
  if (state === 'active') return <AlbumWorkspace client={client} onSignOut={async () => {
    const { error: signOutError } = await client.auth.signOut({ scope: 'local' });
    if (signOutError) throw signOutError;
  }} />;
  return (
    <View style={styles.card}>
      <Heading>{copy?.title ?? 'Checking your album'}</Heading>
      {copy && <Text style={styles.detail}>{copy.detail}</Text>}
      {state === 'owner_ready' && <Action disabled={busy} onPress={issue}>Create invitation code</Action>}
      {state === 'owner_waiting' && (
        <>
          {invite ? <Text style={styles.code} selectable>{invite}</Text> : (
            <Text style={styles.detail}>Create a new code if you need to share it again.</Text>
          )}
          <Action disabled={busy} onPress={issue}>Replace invitation code</Action>
          <Action disabled={busy} onPress={revoke} secondary>Revoke invitation</Action>
        </>
      )}
      {state === 'partner_ready' && (
        <>
          <Text style={styles.label}>Partner invitation code</Text>
          <TextInput
            accessibilityLabel="Partner invitation code" autoCapitalize="none" autoCorrect={false}
            editable={!busy} onChangeText={setCode} onSubmitEditing={() => { if (!busy) void accept(); }}
            style={styles.input} value={code}
          />
          <Action disabled={busy} onPress={accept}>Accept invitation</Action>
        </>
      )}
      {!state && busy && <ActivityIndicator accessibilityLabel="Checking album status" color="#285342" />}
      <Action disabled={busy} onPress={() => run(refresh)} secondary>Check again</Action>
      <Action disabled={busy} onPress={() => run(async () => {
        const { error: signOutError } = await client.auth.signOut({ scope: 'local' });
        if (signOutError) throw signOutError;
      })} secondary>Sign out</Action>
      <ErrorMessage message={error} />
    </View>
  );
}

function Heading({ children, level = 1, onWallpaper }: PropsWithChildren<{ level?: 1 | 2; onWallpaper?: boolean }>) {
  const bodoni = useContext(SignInTypography);
  return <Text accessibilityRole="header" aria-level={level}
    style={[styles.title, onWallpaper && styles.signInText, bodoni && styles.strongFont]}>{children}</Text>;
}

function SignInDetail({ children }: PropsWithChildren) {
  const bodoni = useContext(SignInTypography);
  return <Text style={[styles.detail, styles.signInText, bodoni && styles.readingFont]}>{children}</Text>;
}

function Action({ children, disabled, onPress, secondary }: PropsWithChildren<{
  disabled: boolean;
  onPress: () => void | Promise<void>;
  secondary?: boolean;
}>) {
  const bodoni = useContext(SignInTypography);
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, secondary && styles.secondary, (pressed || disabled) && styles.dim]}>
      <Text style={[styles.buttonText, secondary && styles.secondaryText, bodoni && styles.strongFont]}>{children}</Text>
    </Pressable>
  );
}

function ErrorMessage({ message }: { message: string }) {
  const bodoni = useContext(SignInTypography);
  return message ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.error, bodoni && styles.readingFont]}>{message}</Text> : null;
}

const styles = StyleSheet.create({
  page: {
    flexGrow: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#e9f0e7',
    paddingHorizontal: 20, paddingVertical: 52,
  },
  signInPage: { flex: 1, backgroundColor: '#233d31' },
  signInContent: { backgroundColor: 'transparent', paddingVertical: 42, gap: 22 },
  signInBrand: {
    fontFamily: Platform.select({ web: 'Georgia, serif', ios: 'Georgia', default: 'serif' }),
    color: '#fffaf0', textAlign: 'center', textShadowColor: '#10291f',
    textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 13,
  },
  displayFont: { fontFamily: 'BodoniDisplay' },
  readingFont: { fontFamily: 'BodoniText', fontSize: 16 },
  strongFont: { fontFamily: 'BodoniStrong', fontWeight: 'normal' },
  signInText: {
    color: '#fff', textShadowColor: '#10291f',
    textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  signInCard: {
    maxWidth: 430,
    backgroundColor: 'rgba(252, 253, 249, 0.1)',
    boxShadow: '0 16px 54px rgba(11, 32, 23, 0.32)',
  },
  wallpaperControl: {
    minHeight: 44, justifyContent: 'center', borderRadius: 22, paddingHorizontal: 16,
    backgroundColor: 'rgba(15, 36, 27, 0.76)', borderColor: 'rgba(255, 250, 240, 0.42)', borderWidth: 1,
  },
  wallpaperControlText: { color: '#fffaf0', fontSize: 13, fontWeight: '600' },
  frame: { width: '100%', maxWidth: 1100, gap: 18 },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  brandName: { fontSize: 23, fontWeight: '700', letterSpacing: -0.8, color: '#223b2e' },
  brandMark: {
    width: 20, height: 14, borderTopLeftRadius: 12, borderBottomRightRadius: 12,
    backgroundColor: '#6d957c', transform: [{ rotate: '-22deg' }],
  },
  card: {
    maxWidth: 450, width: '100%', alignSelf: 'center', backgroundColor: '#fcfdf9', borderColor: '#d2ded1', borderWidth: 1,
    borderRadius: 26, padding: 25, gap: 11,
  },
  title: { color: '#173227', fontSize: 31, lineHeight: 35, fontWeight: '700', letterSpacing: -1.15 },
  detail: { color: '#486252', fontSize: 15, lineHeight: 22 },
  label: { color: '#284738', fontSize: 14, fontWeight: '600', marginTop: 7 },
  input: {
    borderWidth: 1, borderColor: '#92a99a', borderRadius: 12, paddingHorizontal: 13,
    minHeight: 48, color: '#18372a', fontSize: 16, backgroundColor: '#fff',
  },
  button: {
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#285342', minHeight: 46,
    borderRadius: 12, paddingHorizontal: 13, paddingVertical: 8,
  },
  secondary: { backgroundColor: '#e9f0e7' },
  dim: { opacity: 0.55 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15, textAlign: 'center' },
  secondaryText: { color: '#254f3c' },
  code: { backgroundColor: '#e9f0e7', color: '#234735', padding: 12, borderRadius: 8, fontSize: 15 },
  error: { color: '#8b302c', fontSize: 14, lineHeight: 19 },
});
