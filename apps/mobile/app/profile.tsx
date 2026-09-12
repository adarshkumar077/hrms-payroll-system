import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

import { API_URL } from '../lib/api';

type Profile = {
  employeeCode: string;
  firstName: string;
  lastName?: string;
  personalEmail?: string;
  department?: string;
  designation?: string;
  status: string;
  personal?: { addressLine1?: string; city?: string; state?: string; pincode?: string };
};

export default function ProfileScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/me/profile`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? 'No profile');
        setProfile(data);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }, [token]);

  async function save() {
    if (!profile || !token) return;
    const res = await fetch(`${API_URL}/me/profile`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalEmail: profile.personalEmail,
        personal: profile.personal,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      Alert.alert('Error', data.message ?? 'Save failed');
      return;
    }
    setProfile(data);
    Alert.alert('Saved', 'Editable fields updated. Contact HR for other changes.');
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.brand}>EITF</Text>
      <Text style={styles.title}>My Profile</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {profile ? (
        <>
          <Text style={styles.meta}>
            {profile.employeeCode} · {profile.firstName} {profile.lastName}
          </Text>
          <Text style={styles.meta}>
            {profile.department ?? '—'} / {profile.designation ?? '—'} · {profile.status}
          </Text>
          <Text style={styles.label}>Personal email</Text>
          <TextInput
            style={styles.input}
            value={profile.personalEmail ?? ''}
            onChangeText={(v) => setProfile({ ...profile, personalEmail: v })}
          />
          <Text style={styles.label}>Address</Text>
          <TextInput
            style={styles.input}
            value={profile.personal?.addressLine1 ?? ''}
            onChangeText={(v) =>
              setProfile({ ...profile, personal: { ...profile.personal, addressLine1: v } })
            }
          />
          <TextInput
            style={styles.input}
            placeholder="City"
            value={profile.personal?.city ?? ''}
            onChangeText={(v) =>
              setProfile({ ...profile, personal: { ...profile.personal, city: v } })
            }
          />
          <Pressable style={styles.btn} onPress={save}>
            <Text style={styles.btnText}>Save</Text>
          </Pressable>
          <Pressable onPress={() => router.push({ pathname: '/attendance', params: { token } })}>
        <Text style={styles.link}>Mark Attendance</Text>
      </Pressable>
      <Pressable onPress={() => router.push({ pathname: '/documents', params: { token } })}>
        <Text style={styles.link}>My Documents</Text>
      </Pressable>
        </>
      ) : (
        !error && <Text style={styles.meta}>Loading…</Text>
      )}
      <Pressable onPress={() => router.replace('/')}>
        <Text style={styles.link}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, backgroundColor: '#f3f0e8', flexGrow: 1 },
  brand: { fontSize: 28, fontWeight: '700', color: '#1a6b54' },
  title: { fontSize: 18, marginTop: 8, marginBottom: 12, color: '#0c1a16' },
  meta: { color: '#0c1a1699', marginBottom: 6, fontSize: 13 },
  label: { marginTop: 12, marginBottom: 4, fontSize: 13, color: '#0c1a16' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d5ebe3',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  btn: { backgroundColor: '#1a6b54', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  btnText: { color: '#fff', fontWeight: '600' },
  link: { color: '#1a6b54', marginTop: 16, textDecorationLine: 'underline' },
  error: { color: '#b91c1c', marginBottom: 8 },
});
