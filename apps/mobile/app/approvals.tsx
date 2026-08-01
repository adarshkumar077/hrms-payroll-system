import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { api } from '../lib/api';

type Item = {
  id: string;
  type: string;
  summary?: string | null;
  status: string;
};

export default function ApprovalsScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');

  function load() {
    if (!token) return;
    api<Item[]>('/approvals/pending', token)
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }

  useEffect(() => {
    load();
  }, [token]);

  async function act(id: string, action: 'APPROVE' | 'REJECT') {
    try {
      await api(`/approvals/${id}/act`, token, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      load();
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Action failed');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Approvals</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {items.map((i) => (
        <View key={i.id} style={styles.card}>
          <Text style={styles.name}>
            {i.type} · {i.status}
          </Text>
          <Text style={styles.meta}>{i.summary ?? i.id}</Text>
          <View style={styles.row}>
            <Pressable style={styles.btn} onPress={() => act(i.id, 'APPROVE')}>
              <Text style={styles.btnText}>Approve</Text>
            </Pressable>
            <Pressable style={styles.btnAlt} onPress={() => act(i.id, 'REJECT')}>
              <Text style={styles.btnAltText}>Reject</Text>
            </Pressable>
          </View>
        </View>
      ))}
      {!items.length && !error && <Text style={styles.meta}>No pending approvals</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 56, backgroundColor: '#f3f0e8', flexGrow: 1 },
  back: { color: '#1a6b54', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a6b54', marginBottom: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#d5ebe3',
    marginBottom: 10,
  },
  name: { fontWeight: '600', color: '#0c1a16' },
  meta: { marginTop: 4, color: '#0c1a1699', fontSize: 13 },
  error: { color: '#b91c1c', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: { backgroundColor: '#1a6b54', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
  btnText: { color: '#fff', fontWeight: '600' },
  btnAlt: { borderWidth: 1, borderColor: '#1a6b54', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
  btnAltText: { color: '#1a6b54', fontWeight: '600' },
});
