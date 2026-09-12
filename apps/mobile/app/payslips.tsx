import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

import { API_URL } from '../lib/api';

type Payslip = {
  id: string;
  netPay: number;
  payrollRun: { year: number; month: number };
};

export default function PayslipsScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [items, setItems] = useState<Payslip[]>([]);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/payroll/my-payslips`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setItems(d);
      });
  }, [token]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>My Payslips</Text>
      {items.map((p) => (
        <View key={p.id} style={styles.card}>
          <Text style={styles.row}>
            {p.payrollRun.year}-{String(p.payrollRun.month).padStart(2, '0')}
          </Text>
          <Text style={styles.meta}>Net {p.netPay.toFixed(2)}</Text>
        </View>
      ))}
      {items.length === 0 && <Text style={styles.meta}>No locked payslips</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, backgroundColor: '#f3f0e8', flexGrow: 1 },
  back: { color: '#1a6b54', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a6b54', marginBottom: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#d5ebe3',
  },
  row: { fontWeight: '600', color: '#0c1a16' },
  meta: { marginTop: 4, color: '#0c1a1699', fontSize: 13 },
});
