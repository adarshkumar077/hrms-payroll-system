import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert, ScrollView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

import { API_URL } from '../lib/api';

type LeaveType = { id: string; code: string; name: string };
type Balance = { available: number; leaveType: LeaveType };

export default function LeaveScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!token) return;
    const h = { Authorization: `Bearer ${token}` };
    fetch(`${API_URL}/leave/types`, { headers: h })
      .then((r) => r.json())
      .then(setTypes);
    fetch(`${API_URL}/me/leave/balances`, { headers: h })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setBalances(d);
      });
  }, [token]);

  async function apply() {
    const res = await fetch(`${API_URL}/me/leave/apply`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ leaveTypeId, fromDate, toDate, reason }),
    });
    const data = await res.json();
    if (!res.ok) {
      Alert.alert('Error', data.message ?? 'Failed');
      return;
    }
    Alert.alert('Submitted', 'Leave request pending approval');
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Apply Leave</Text>
      <View style={styles.balRow}>
        {balances.map((b) => (
          <View key={b.leaveType.id} style={styles.bal}>
            <Text style={styles.balCode}>{b.leaveType.code}</Text>
            <Text style={styles.balNum}>{b.available}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.label}>Type id (pick from list)</Text>
      {types.map((t) => (
        <Pressable key={t.id} onPress={() => setLeaveTypeId(t.id)} style={[styles.chip, leaveTypeId === t.id && styles.chipOn]}>
          <Text>{t.name} ({t.code})</Text>
        </Pressable>
      ))}
      <TextInput style={styles.input} placeholder="From YYYY-MM-DD" value={fromDate} onChangeText={setFromDate} />
      <TextInput style={styles.input} placeholder="To YYYY-MM-DD" value={toDate} onChangeText={setToDate} />
      <TextInput style={styles.input} placeholder="Reason" value={reason} onChangeText={setReason} />
      <Pressable style={styles.btn} onPress={apply}>
        <Text style={styles.btnText}>Submit</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, backgroundColor: '#f3f0e8', flexGrow: 1 },
  back: { color: '#1a6b54', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '600', color: '#0c1a16', marginBottom: 12 },
  balRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  bal: { backgroundColor: '#fff', padding: 10, borderRadius: 8, minWidth: 64, borderWidth: 1, borderColor: '#d5ebe3' },
  balCode: { fontSize: 11, color: '#0c1a1699' },
  balNum: { fontSize: 18, fontWeight: '700', color: '#1a6b54' },
  label: { marginBottom: 6, color: '#0c1a16' },
  chip: { backgroundColor: '#fff', padding: 10, borderRadius: 8, marginBottom: 6, borderWidth: 1, borderColor: '#d5ebe3' },
  chipOn: { backgroundColor: '#d5ebe3' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d5ebe3', borderRadius: 8, padding: 12, marginBottom: 10 },
  btn: { backgroundColor: '#1a6b54', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontWeight: '600' },
});
