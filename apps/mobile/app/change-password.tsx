import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

import { api } from '../lib/api';

const MIN_PASSWORD_LENGTH = 8;

export default function ChangePasswordScreen() {
  const { token, roles: rolesParam } = useLocalSearchParams<{ token: string; roles?: string }>();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!token) return;
    if (newPassword !== confirmPassword) {
      Alert.alert('Passwords do not match', 'New password and confirmation must be the same.');
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      Alert.alert(
        'Password too short',
        `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
      return;
    }
    setLoading(true);
    try {
      await api('/auth/password/change', token, {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      let roles = rolesParam ?? '';
      try {
        const me = await api<{ roles?: string[] }>('/auth/me', token);
        if (me.roles) roles = me.roles.join(',');
      } catch {
        // Keep the roles we already have if /auth/me is unavailable.
      }
      Alert.alert('Password changed', 'Your password has been updated.');
      router.replace({ pathname: '/home', params: { token, roles } });
    } catch (e) {
      Alert.alert('Change failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.brand}>EITF</Text>
      <Text style={styles.title}>Change password</Text>
      <Text style={styles.sub}>
        You must change your password before you can continue. Use at least {MIN_PASSWORD_LENGTH}{' '}
        characters.
      </Text>
      <TextInput
        style={styles.input}
        secureTextEntry
        placeholder="Current password"
        value={currentPassword}
        onChangeText={setCurrentPassword}
      />
      <TextInput
        style={styles.input}
        secureTextEntry
        placeholder="New password"
        value={newPassword}
        onChangeText={setNewPassword}
      />
      <TextInput
        style={styles.input}
        secureTextEntry
        placeholder="Confirm new password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />
      <Pressable style={styles.btn} onPress={submit} disabled={loading}>
        <Text style={styles.btnText}>{loading ? 'Updating…' : 'Update password'}</Text>
      </Pressable>
      {router.canGoBack() ? (
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>Cancel</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, backgroundColor: '#f3f0e8', flexGrow: 1 },
  brand: { fontSize: 28, fontWeight: '700', color: '#1a6b54' },
  title: { fontSize: 18, marginTop: 8, marginBottom: 8, color: '#0c1a16' },
  sub: { fontSize: 13, color: '#0c1a1699', marginBottom: 20 },
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
  link: { color: '#1a6b54', marginTop: 16, textDecorationLine: 'underline', textAlign: 'center' },
});
