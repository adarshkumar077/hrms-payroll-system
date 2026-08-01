import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert, ScrollView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type Loan = { id: string; type: string; amount: number; status: string; outstanding: number };

export default function LoansScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [items, setItems] = useState<Loan[]>([]);
  const [amount, setAmount] = useState('5000');
  const [tenure, setTenure] = useState('3');
  const [reason, setReason] = useState('');

  function load() {
    fetch(`${API_URL}/loans/mine`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setItems(d);
      });
  }

  useEffect(() => {
    if (token) load();
  }, [token]);

  async function submit() {
    const res = await fetch(`${API_URL}/loans`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'ADVANCE',
        amount: Number(amount),
        tenureMonths: Number(tenure),
        reason,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      Alert.alert('Error', data.message ?? 'Failed');
      return;
    }
    Alert.alert('Submitted', 'Pending finance approval');
    load();
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Loans & Advances</Text>
      <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="Amount" keyboardType="numeric" />
      <TextInput style={styles.input} value={tenure} onChangeText={setTenure} placeholder="Tenure months" keyboardType="numeric" />
      <TextInput style={styles.input} value={reason} onChangeText={setReason} placeholder="Reason" />
      <Pressable style={styles.btn} onPress={submit}>
        <Text style={styles.btnText}>Request advance</Text>
      </Pressable>
      {items.map((l) => (
        <View key={l.id} style={styles.card}>
          <Text style={styles.row}>
            {l.type} {l.amount} · {l.status}
          </Text>
          <Text style={styles.meta}>Outstanding {l.outstanding}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, backgroundColor: '#f3f0e8', flexGrow: 1 },
  back: { color: '#1a6b54', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a6b54', marginBottom: 16 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d5ebe3',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  btn: { backgroundColor: '#1a6b54', padding: 14, borderRadius: 8, marginBottom: 16 },
  btnText: { color: '#fff', textAlign: 'center', fontWeight: '600' },
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
