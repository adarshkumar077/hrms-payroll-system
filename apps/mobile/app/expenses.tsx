import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert, ScrollView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type Claim = { id: string; category: string; amount: number; status: string };

export default function ExpensesScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [items, setItems] = useState<Claim[]>([]);
  const [amount, setAmount] = useState('500');
  const [description, setDescription] = useState('');

  function load() {
    fetch(`${API_URL}/reimbursements/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setItems(d);
      });
  }

  useEffect(() => {
    if (token) load();
  }, [token]);

  async function submit() {
    const res = await fetch(`${API_URL}/reimbursements`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        category: 'Travel',
        amount: Number(amount),
        description,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      Alert.alert('Error', data.message ?? 'Failed');
      return;
    }
    Alert.alert('Submitted', 'Pending HR + CEO approval');
    load();
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Expenses</Text>
      <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="Amount" keyboardType="numeric" />
      <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="Description" />
      <Pressable style={styles.btn} onPress={submit}>
        <Text style={styles.btnText}>Submit Travel claim</Text>
      </Pressable>
      {items.map((c) => (
        <View key={c.id} style={styles.card}>
          <Text style={styles.row}>
            {c.category} {c.amount} · {c.status}
          </Text>
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
});
