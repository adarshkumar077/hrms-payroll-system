export function parseUserAgent(ua?: string | null) {
  if (!ua) return { device: 'Unknown', browser: 'Unknown' };
  let device = 'Desktop';
  if (/tablet|ipad/i.test(ua)) device = 'Tablet';
  else if (/mobile|android|iphone/i.test(ua)) device = 'Mobile';
  let browser = 'Unknown';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/chrome/i.test(ua)) browser = 'Chrome';
  else if (/firefox/i.test(ua)) browser = 'Firefox';
  else if (/safari/i.test(ua)) browser = 'Safari';
  return { device, browser };
}
