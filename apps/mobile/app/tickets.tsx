import { useState } from 'react';
import { Text, StyleSheet, Pressable, TextInput, Alert, ScrollView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

import { API_URL } from '../lib/api';

export default function TicketsMobile() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');

  async function create() {
    const res = await fetch(`${API_URL}/tickets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'IT', subject, description, priority: 'MEDIUM' }),
    });
    const data = await res.json();
    if (!res.ok) {
      Alert.alert('Error', data.message ?? 'Failed');
      return;
    }
    Alert.alert('Created', data.ticketNo ?? 'Ticket raised');
    setSubject('');
    setDescription('');
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Helpdesk</Text>
      <TextInput style={styles.input} placeholder="Subject" value={subject} onChangeText={setSubject} />
      <TextInput style={styles.input} placeholder="Description" value={description} onChangeText={setDescription} />
      <Pressable style={styles.btn} onPress={create}>
        <Text style={styles.btnText}>Raise IT ticket</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, backgroundColor: '#f3f0e8', flexGrow: 1 },
  back: { color: '#1a6b54', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a6b54', marginBottom: 16 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d5ebe3', borderRadius: 8, padding: 12, marginBottom: 10 },
  btn: { backgroundColor: '#1a6b54', padding: 14, borderRadius: 8 },
  btnText: { color: '#fff', textAlign: 'center', fontWeight: '600' },
});
