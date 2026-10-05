import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import NetInfo from '@react-native-community/netinfo';
import {
  downloadPack,
  loadEstates,
  savedPack,
  removeSaved,
  SavedPack,
} from './src/offline';
export default function App() {
  const [host, setHost] = useState('https://mapping.digitalpalm.ai'),
    [token, setToken] = useState(''),
    [estates, setEstates] = useState<any[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [pack, setPack] = useState<SavedPack | null>(null),
    [view, setView] = useState(false),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(''),
    [online, setOnline] = useState(true);
  const [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  useEffect(() => {
    savedPack().then(setPack);
    return NetInfo.addEventListener(s => setOnline(s.isConnected !== false));
  }, []);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setStatus('');
    try {
      await fn();
    } catch (e: any) {
      setStatus(e.message || 'Unable to open maps');
    } finally {
      setBusy(false);
    }
  }
  const button = (text: string, fn: () => void, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      onPress={fn}
      style={[styles.button, (disabled || busy) && { opacity: 0.5 }]}
    >
      <Text style={styles.buttonText}>{text}</Text>
    </Pressable>
  );
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          <Text style={styles.logo}>◈ Estate Atlas</Text>
          <Text style={styles.sub}>
            DIGITALPALM · {online ? 'CONNECTED' : 'OFFLINE'}
          </Text>
        </View>
        {view && pack ? (
          <>
            <View style={styles.back}>
              {button('‹ Saved estates', () => setView(false))}
            </View>
            <WebView
              source={{ uri: 'file://' + pack.folder + '/index.html' }}
              originWhitelist={['file://*']}
              allowingReadAccessToURL={'file://' + pack.folder + '/'}
              allowFileAccess
              allowFileAccessFromFileURLs
              javaScriptEnabled
              setSupportMultipleWindows={false}
              onShouldStartLoadWithRequest={r =>
                r.url.startsWith('file://' + pack.folder + '/') ||
                r.url === 'about:blank'
              }
              onError={e => setStatus(e.nativeEvent.description)}
              style={{ flex: 1 }}
            />
          </>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title}>Your estate, wherever you are.</Text>
            <Text style={styles.body}>
              Save maps before fieldwork. Dated images, boundaries and
              topography stay on this device.
            </Text>
            {pack && (
              <View style={styles.card}>
                <Text style={styles.section}>Saved estates</Text>
                <Text style={styles.body}>{pack.estates.join(', ')}</Text>
                <Text style={styles.caption}>
                  Updated {pack.createdAt.slice(0, 10)}
                </Text>
                {button('Open offline maps', () => setView(true))}
                {button('Remove downloaded maps', () =>
                  run(async () => {
                    await removeSaved();
                    setPack(null);
                  }),
                )}
              </View>
            )}
            <View style={styles.card}>
              <Text style={styles.section}>Connect to DigitalPalm</Text>
              <TextInput
                accessibilityLabel="Hosting address"
                placeholder="https://mapping.your-domain.com"
                autoCapitalize="none"
                autoCorrect={false}
                value={host}
                onChangeText={setHost}
                style={styles.input}
              />
              <TextInput
                accessibilityLabel="DigitalPalm access token"
                placeholder="DigitalPalm access token"
                secureTextEntry
                autoCapitalize="none"
                value={token}
                onChangeText={setToken}
                style={styles.input}
              />
              <Text style={styles.caption}>
                The access token is kept in memory only.
              </Text>
              {button(
                'Load estates',
                () =>
                  run(async () => {
                    const data = await loadEstates(host, token);
                    if (pack && pack.subject !== data.access.subject) {
                      await removeSaved();
                      setPack(null);
                    }
                    setEstates(data.estates);
                    setSelected(data.estates.slice(0, 1).map((e: any) => e.id));
                  }),
                !online || !host,
              )}
              {estates.map(e => (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected.includes(e.id) }}
                  key={e.id}
                  onPress={() => setSelected([e.id])}
                  style={styles.estate}
                >
                  <Text style={styles.body}>
                    {selected.includes(e.id) ? '◉' : '○'} {e.name}
                  </Text>
                </Pressable>
              ))}
              {estates.length > 0 && (
                <View>
                  <Text style={styles.caption}>
                    Optional offline window (YYYY-MM-DD). Leave blank for all
                    history. Maximum 25,000 records, 200 files and 512 MB per
                    package.
                  </Text>
                  <TextInput
                    accessibilityLabel="Offline from date"
                    placeholder="From YYYY-MM-DD"
                    value={from}
                    onChangeText={setFrom}
                    style={styles.input}
                    autoCapitalize="none"
                  />
                  <TextInput
                    accessibilityLabel="Offline before date"
                    placeholder="Before YYYY-MM-DD"
                    value={to}
                    onChangeText={setTo}
                    style={styles.input}
                    autoCapitalize="none"
                  />
                </View>
              )}
              {estates.length > 0 &&
                button(
                  'Download selected estate',
                  () =>
                    run(async () => {
                      const saved = await downloadPack(
                        host,
                        token,
                        selected,
                        setStatus,
                        { from: from || undefined, to: to || undefined },
                      );
                      setPack(saved);
                      setStatus(
                        'All files verified and saved. You can now work offline.',
                      );
                    }),
                  !online || !selected.length,
                )}
            </View>
            <Text accessibilityRole="alert" style={styles.body}>
              {status}
            </Text>
            <Text style={styles.caption}>
              QGIS / QField projects are available from the web dashboard for
              offline field data collection. This app provides offline map
              viewing.
            </Text>
          </ScrollView>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f1f5ed' },
  header: { backgroundColor: '#153f2b', padding: 18 },
  logo: { color: '#edc358', fontSize: 23, fontWeight: '700' },
  sub: { color: '#e3eada', fontSize: 10, letterSpacing: 1.5, marginTop: 6 },
  content: { padding: 18, paddingBottom: 45 },
  title: {
    fontSize: 27,
    color: '#173f2c',
    fontWeight: '700',
    marginVertical: 16,
  },
  body: { color: '#38523b', fontSize: 14, lineHeight: 22 },
  caption: {
    color: '#71816b',
    fontSize: 12,
    lineHeight: 18,
    marginVertical: 8,
  },
  card: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 14,
    marginTop: 18,
    borderWidth: 1,
    borderColor: '#dce4d6',
  },
  section: { fontSize: 18, fontWeight: '600', color: '#173f2c' },
  input: {
    borderWidth: 1,
    borderColor: '#d6dfcf',
    borderRadius: 8,
    padding: 12,
    color: '#183f2b',
    marginTop: 12,
  },
  button: {
    backgroundColor: '#1b4833',
    borderRadius: 8,
    padding: 13,
    marginTop: 10,
    alignItems: 'center',
  },
  buttonText: { color: 'white', fontWeight: '600' },
  estate: { paddingVertical: 9 },
  back: { paddingHorizontal: 12, paddingBottom: 10 },
});
