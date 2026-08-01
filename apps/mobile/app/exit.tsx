import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert, ScrollView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export default function ExitMobile() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [lwd, setLwd] = useState('');
  const [reason, setReason] = useState('');

  async function resign() {
    const res = await fetch(`${API_URL}/exit/resign`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ lastWorkingDay: lwd, noticeDays: 30, reason }),
    });
    const data = await res.json();
    if (!res.ok) {
      Alert.alert('Error', data.message ?? 'Failed');
      return;
    }
    Alert.alert('Submitted', 'Resignation pending HR approval');
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Resign</Text>
      <TextInput
        style={styles.input}
        placeholder="Last working day YYYY-MM-DD"
        value={lwd}
        onChangeText={setLwd}
      />
      <TextInput style={styles.input} placeholder="Reason" value={reason} onChangeText={setReason} />
      <Pressable style={styles.btn} onPress={resign}>
        <Text style={styles.btnText}>Submit resignation</Text>
      </Pressable>
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
  btn: { backgroundColor: '#1a6b54', padding: 14, borderRadius: 8 },
  btnText: { color: '#fff', textAlign: 'center', fontWeight: '600' },
});
