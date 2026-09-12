import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, TextInput } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

import { API_URL } from '../lib/api';

export default function AttendanceScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [method, setMethod] = useState('MANUAL');
  const [summary, setSummary] = useState('');
  const [qr, setQr] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/me/attendance/summary`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.message) setSummary(d.message);
        else {
          const counts = Object.entries(d.counts ?? {})
            .map(([k, v]) => `${k}:${v}`)
            .join(' ');
          setSummary(
            `${counts || 'No records'} | Late ${d.counter?.lateMarkCount ?? 0} | Incentive ${d.incentive?.eligible ? 'OK' : 'NO'}`,
          );
        }
      })
      .catch(() => setSummary('Unable to load summary'));
  }, [token]);

  async function mark(punchType: 'IN' | 'OUT') {
    try {
      const body: Record<string, unknown> = { method, punchType };
      if (method === 'GPS' || method === 'GEOFENCE') {
        body.latitude = Number(lat);
        body.longitude = Number(lng);
      }
      if (method === 'QR') body.qrPayload = qr;
      if (method === 'SELFIE') body.selfieUrl = 'https://placeholder.local/selfie.jpg';

      const res = await fetch(`${API_URL}/me/attendance/mark`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Failed');
      Alert.alert(
        'Marked',
        `${punchType} → ${data.record.status}${data.record.isLate ? ` late ${data.record.lateMinutes}m` : ''}`,
      );
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <View style={styles.container}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Mark Attendance</Text>
      <Text style={styles.meta}>{summary}</Text>
      <View style={styles.row}>
        {['MANUAL', 'GPS', 'GEOFENCE', 'QR', 'SELFIE'].map((m) => (
          <Pressable key={m} onPress={() => setMethod(m)} style={[styles.chip, method === m && styles.chipOn]}>
            <Text style={styles.chipText}>{m}</Text>
          </Pressable>
        ))}
      </View>
      {method === 'QR' && (
        <TextInput style={styles.input} value={qr} onChangeText={setQr} placeholder="QR secret" />
      )}
      {(method === 'GPS' || method === 'GEOFENCE') && (
        <>
          <TextInput style={styles.input} value={lat} onChangeText={setLat} placeholder="Latitude" keyboardType="decimal-pad" />
          <TextInput style={styles.input} value={lng} onChangeText={setLng} placeholder="Longitude" keyboardType="decimal-pad" />
        </>
      )}
      <Pressable style={styles.btn} onPress={() => mark('IN')}>
        <Text style={styles.btnText}>Check in</Text>
      </Pressable>
      <Pressable style={[styles.btn, styles.btnDark]} onPress={() => mark('OUT')}>
        <Text style={styles.btnText}>Check out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 64, backgroundColor: '#f3f0e8' },
  back: { color: '#1a6b54', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '600', color: '#0c1a16' },
  meta: { marginTop: 8, marginBottom: 16, color: '#0c1a1699', fontSize: 13 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d5ebe3',
  },
  chipOn: { backgroundColor: '#d5ebe3' },
  chipText: { fontSize: 12, color: '#0c1a16' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d5ebe3',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  btn: { backgroundColor: '#1a6b54', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  btnDark: { backgroundColor: '#0f4034' },
  btnText: { color: '#fff', fontWeight: '600' },
});
