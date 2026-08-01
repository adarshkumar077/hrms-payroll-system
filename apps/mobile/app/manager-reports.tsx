import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { api } from '../lib/api';

export default function ManagerReportsScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [dept, setDept] = useState<{ department: string; headcount: number }[]>([]);
  const [empCount, setEmpCount] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    Promise.all([
      api<{ rows: { department: string; headcount: number }[] }>('/reports/department', token),
      api<{ rows: unknown[] }>('/reports/employee', token),
    ])
      .then(([d, e]) => {
        setDept(d.rows ?? []);
        setEmpCount(e.rows?.length ?? 0);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed'));
  }, [token]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Team Reports</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.card}>
        <Text style={styles.name}>Employees (report)</Text>
        <Text style={styles.meta}>{empCount}</Text>
      </View>
      {dept.map((d) => (
        <View key={d.department} style={styles.card}>
          <Text style={styles.name}>{d.department}</Text>
          <Text style={styles.meta}>Headcount {d.headcount}</Text>
        </View>
      ))}
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
