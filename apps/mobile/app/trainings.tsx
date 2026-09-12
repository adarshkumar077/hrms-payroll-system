import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert, ScrollView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

import { API_URL } from '../lib/api';

type Mine = { id: string; status: string; training: { id: string; title: string } };

export default function TrainingsMobile() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [items, setItems] = useState<Mine[]>([]);

  function load() {
    fetch(`${API_URL}/me/trainings`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setItems(d);
      });
  }

  useEffect(() => {
    if (token) load();
  }, [token]);

  async function complete(trainingId: string) {
    const res = await fetch(`${API_URL}/trainings/${trainingId}/complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ score: 85, issueCertificate: true }),
    });
    if (!res.ok) {
      const data = await res.json();
      Alert.alert('Error', data.message ?? 'Failed');
      return;
    }
    Alert.alert('Done', 'Training completed');
    load();
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>My Training</Text>
      {items.map((m) => (
        <View key={m.id} style={styles.card}>
          <Text style={styles.row}>{m.training.title}</Text>
          <Text style={styles.meta}>{m.status}</Text>
          {m.status !== 'COMPLETED' && (
            <Pressable style={styles.btn} onPress={() => complete(m.training.id)}>
              <Text style={styles.btnText}>Complete</Text>
            </Pressable>
          )}
        </View>
      ))}
      {items.length === 0 && <Text style={styles.meta}>No assignments</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, backgroundColor: '#f3f0e8', flexGrow: 1 },
  back: { color: '#1a6b54', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a6b54', marginBottom: 16 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#d5ebe3' },
  row: { fontWeight: '600', color: '#0c1a16' },
  meta: { marginTop: 4, color: '#0c1a1699', fontSize: 13 },
  btn: { marginTop: 8, backgroundColor: '#1a6b54', padding: 10, borderRadius: 8 },
  btnText: { color: '#fff', textAlign: 'center', fontWeight: '600' },
});
