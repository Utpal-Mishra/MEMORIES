import { useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import {
  ActivityIndicator, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View,
} from 'react-native';

import { supabase, trackNativeSession } from './supabase';

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
  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <StatusBar barStyle="dark-content" />
      <View style={styles.frame}>
        <View style={styles.brand}>
          <Text style={styles.brandName}>For Her</Text>
          <View style={styles.brandMark} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        </View>
        <View style={styles.card}>
          {supabase ? <Account client={supabase} /> : (
            <>
              <Heading>Album setup required</Heading>
              <Text style={styles.detail}>Connect the app to its Supabase project to enable sign-in.</Text>
            </>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

function Account({ client }: { client: SupabaseClient }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    const stopTracking = trackNativeSession();
    return () => {
      subscription.unsubscribe();
      stopTracking?.();
    };
  }, [client]);

  if (session === undefined) return <ActivityIndicator accessibilityLabel="Loading album" color="#285342" />;

  return session
    ? <Pairing key={session.user.id} client={client} />
    : <SignIn client={client} />;
}

function SignIn({ client }: { client: SupabaseClient }) {
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
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the six-digit code from your email.');
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
      <Heading>{setup ? 'Set up your sign-in' : sentTo ? 'Check your email' : 'Open your album'}</Heading>
      <Text style={styles.detail}>
        {setup ? 'Use the six-digit setup code in the email that invited you to For Her.'
          : sentTo ? 'If that address is set up for the album, you’ll receive a six-digit code.'
          : 'Enter your email to get a one-time sign-in code.'}
      </Text>
      {!sentTo && (
        <>
          <Text style={styles.label}>Email address</Text>
          <TextInput
            accessibilityLabel="Email address" autoCapitalize="none" autoComplete="email"
            autoCorrect={false} editable={!busy} keyboardType="email-address" onChangeText={setEmail}
            style={styles.input} value={email}
          />
        </>
      )}
      {(setup || sentTo) ? (
        <>
          <Text style={styles.label}>{setup ? 'Email setup code' : 'Email sign-in code'}</Text>
          <TextInput
            accessibilityLabel={setup ? 'Email setup code' : 'Email sign-in code'}
            autoComplete="one-time-code" editable={!busy} keyboardType="number-pad" maxLength={6}
            onChangeText={setCode} style={styles.input} value={code}
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
  return (
    <>
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
      {state !== 'active' && <Action disabled={busy} onPress={() => run(refresh)} secondary>Check again</Action>}
      <Action disabled={busy} onPress={() => run(async () => {
        const { error: signOutError } = await client.auth.signOut({ scope: 'local' });
        if (signOutError) throw signOutError;
      })} secondary>Sign out</Action>
      <ErrorMessage message={error} />
    </>
  );
}

function Heading({ children }: PropsWithChildren) {
  return <Text accessibilityRole="header" style={styles.title}>{children}</Text>;
}

function Action({ children, disabled, onPress, secondary }: PropsWithChildren<{
  disabled: boolean;
  onPress: () => void | Promise<void>;
  secondary?: boolean;
}>) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, secondary && styles.secondary, (pressed || disabled) && styles.dim]}>
      <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{children}</Text>
    </Pressable>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return message ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{message}</Text> : null;
}

const styles = StyleSheet.create({
  page: {
    flexGrow: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#e9f0e7',
    paddingHorizontal: 20, paddingVertical: 52,
  },
  frame: { width: '100%', maxWidth: 450, gap: 18 },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  brandName: { fontSize: 23, fontWeight: '700', letterSpacing: -0.8, color: '#223b2e' },
  brandMark: {
    width: 20, height: 14, borderTopLeftRadius: 12, borderBottomRightRadius: 12,
    backgroundColor: '#6d957c', transform: [{ rotate: '-22deg' }],
  },
  card: {
    backgroundColor: '#fcfdf9', borderColor: '#d2ded1', borderWidth: 1,
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
