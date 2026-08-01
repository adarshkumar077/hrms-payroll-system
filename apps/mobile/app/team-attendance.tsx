import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { api } from '../lib/api';

type Row = {
  date?: string;
  status?: string;
  employee?: { employeeCode: string; firstName: string };
  employeeCode?: string;
  name?: string;
};

export default function TeamAttendanceScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    const y = new Date().getFullYear();
    const m = new Date().getMonth() + 1;
    api<{ rows?: Row[] } | Row[]>(`/attendance/team?date=${new Date().toISOString().slice(0, 10)}`, token)
      .then((r) => setRows(Array.isArray(r) ? r : r.rows ?? []))
      .catch(async () => {
        // fallback to attendance report for managers
        try {
          const rep = await api<{ rows: Row[] }>(`/reports/attendance?year=${y}&month=${m}`, token);
          setRows(rep.rows ?? []);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed');
        }
      });
  }, [token]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Team Attendance</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {rows.slice(0, 80).map((r, i) => (
        <View key={i} style={styles.card}>
          <Text style={styles.name}>
            {r.employeeCode ?? r.employee?.employeeCode ?? '—'}{' '}
            {r.name ?? r.employee?.firstName ?? ''}
          </Text>
          <Text style={styles.meta}>
            {r.date ?? ''} · {r.status ?? ''}
          </Text>
        </View>
      ))}
      {!rows.length && !error && <Text style={styles.meta}>No rows</Text>}
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
    padding: 10,
    borderWidth: 1,
    borderColor: '#d5ebe3',
    marginBottom: 8,
  },
  name: { fontWeight: '600', color: '#0c1a16', fontSize: 13 },
  meta: { marginTop: 2, color: '#0c1a1699', fontSize: 12 },
  error: { color: '#b91c1c', marginBottom: 8 },
});
