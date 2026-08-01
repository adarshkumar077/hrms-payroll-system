import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

@Injectable()
export class StorageService implements OnModuleInit {
  private rootDir!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.rootDir = this.config.get('LOCAL_STORAGE_DIR') ?? path.join(process.cwd(), 'uploads');
    if (!existsSync(this.rootDir)) {
      mkdirSync(this.rootDir, { recursive: true });
    }
  }

  get provider() {
    const endpoint = this.config.get('S3_ENDPOINT');
    return endpoint ? 's3' : 'local';
  }

  async saveLocal(companyId: string, employeeId: string, fileName: string, buffer: Buffer) {
    const key = `${companyId}/${employeeId}/${randomUUID()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const full = path.join(this.rootDir, key);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, buffer);
    return { storageKey: key, storageProvider: 'local' as const };
  }

  openReadStream(storageKey: string) {
    const full = path.join(this.rootDir, storageKey);
    if (!existsSync(full)) {
      throw new Error('File not found on disk');
    }
    return createReadStream(full);
  }

  absolutePath(storageKey: string) {
    return path.join(this.rootDir, storageKey);
  }

  deleteLocal(storageKey: string) {
    const full = path.join(this.rootDir, storageKey);
    if (existsSync(full)) unlinkSync(full);
  }
}
