import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { apiPublic } from '../lib/api';

export default function Index() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function login() {
    setLoading(true);
    try {
      const data = await apiPublic<{ accessToken: string; user?: { roles?: string[] } }>(
        '/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ identifier, password }),
        },
      );
      const roles = (data.user?.roles ?? []).join(',');
      router.push({
        pathname: '/home',
        params: { token: data.accessToken, roles },
      });
    } catch (e) {
      Alert.alert('Login failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>EITF</Text>
      <Text style={styles.title}>HRMS Mobile</Text>
      <Text style={styles.sub}>Employee + manager role-gated screens</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        value={identifier}
        onChangeText={setIdentifier}
        placeholder="User ID (e.g. emp001)"
      />
      <TextInput
        style={styles.input}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
      />
      <Pressable style={styles.btn} onPress={login} disabled={loading}>
        <Text style={styles.btnText}>{loading ? 'Signing in…' : 'Sign in'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#f3f0e8' },
  brand: { fontSize: 36, fontWeight: '700', color: '#1a6b54' },
  title: { fontSize: 22, marginTop: 4, color: '#0c1a16' },
  sub: { fontSize: 13, color: '#0c1a1699', marginBottom: 24, marginTop: 8 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d5ebe3',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  btn: { backgroundColor: '#1a6b54', padding: 14, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '600' },
});
