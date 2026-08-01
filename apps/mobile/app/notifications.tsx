import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { api } from '../lib/api';

type N = { id: string; title: string; body: string; status: string; createdAt: string };

export default function NotificationsScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [items, setItems] = useState<N[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    api<N[]>('/notifications/mine', token)
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }, [token]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Notifications</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {items.map((n) => (
        <View key={n.id} style={styles.card}>
          <Text style={styles.name}>{n.title}</Text>
          <Text style={styles.meta}>{n.body}</Text>
          <Text style={styles.meta}>
            {n.status} · {new Date(n.createdAt).toLocaleString()}
          </Text>
        </View>
      ))}
      {!items.length && !error && <Text style={styles.meta}>Inbox empty</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 56, backgroundColor: '#f3f0e8', flexGrow: 1 },
  back: { color: '#1a6b54', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a6b54', marginBottom: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#d5ebe3',
    marginBottom: 8,
  },
  name: { fontWeight: '600', color: '#0c1a16' },
  meta: { marginTop: 4, color: '#0c1a1699', fontSize: 13 },
  error: { color: '#b91c1c', marginBottom: 8 },
});
