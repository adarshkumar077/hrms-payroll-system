import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { api } from '../lib/api';

type Lead = {
  id: string;
  title: string;
  status: string;
  phone?: string | null;
  source?: string | null;
};

export default function CrmLeadsScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    api<Lead[]>('/crm/leads', token)
      .then(setLeads)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }, [token]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>CRM Leads</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {leads.map((l) => (
        <View key={l.id} style={styles.card}>
          <Text style={styles.name}>{l.title}</Text>
          <Text style={styles.meta}>
            {l.status} · {l.phone ?? '—'} · {l.source ?? '—'}
          </Text>
        </View>
      ))}
      {!leads.length && !error && <Text style={styles.meta}>No leads.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  back: { color: '#1a6b54', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a6b54', marginBottom: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e8f0ec',
  },
  name: { fontSize: 16, fontWeight: '600' },
  meta: { color: '#666', marginTop: 4, fontSize: 13 },
  error: { color: '#b00020', marginBottom: 8 },
});
