import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';

function keyFromConfig(config: ConfigService) {
  const secret = config.get<string>('INTEGRATION_SECRET_KEY') ?? config.get<string>('JWT_ACCESS_SECRET') ?? 'eitf-dev-secret-key';
  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(config: ConfigService, plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFromConfig(config), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSecret(config: ConfigService, payload: string) {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', keyFromConfig(config), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
