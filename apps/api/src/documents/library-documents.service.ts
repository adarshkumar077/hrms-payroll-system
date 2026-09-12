import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { AuditAction, RoleCode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from './storage.service';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import { assertSafeUpload } from '../common/file-validation.util';

@Injectable()
export class LibraryDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  private access(user: AuthUser) {
    if (user.roles.includes(RoleCode.SUPER_ADMIN) || user.roles.includes(RoleCode.ADMIN)) return 'FULL';
    if (user.roles.includes(RoleCode.HR)) return 'DEPARTMENT';
    return 'OWN';
  }

  private assertCanSee(user: AuthUser, doc: { employeeId: string | null; folder: string; uploadedBy: string | null }) {
    const level = this.access(user);
    if (level === 'FULL') return;
    if (level === 'DEPARTMENT') return;
    if (doc.employeeId && doc.employeeId === user.employeeId) return;
    if (doc.uploadedBy === user.id) return;
    if (doc.folder === 'COMPANY' && !doc.employeeId) return;
    throw new ForbiddenException();
  }

  async list(user: AuthUser, q?: { folder?: string; search?: string }) {
    const level = this.access(user);
    const where: Record<string, unknown> = { companyId: user.companyId, deletedAt: null };
    if (q?.folder) where.folder = q.folder;
    if (q?.search) where.title = { contains: q.search, mode: 'insensitive' };
    if (level === 'OWN') {
      where.OR = [{ employeeId: user.employeeId }, { uploadedBy: user.id }, { folder: 'COMPANY', employeeId: null }];
    }
    return this.prisma.libraryDocument.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }

  async upload(
    user: AuthUser,
    file: Express.Multer.File,
    meta: { folder: string; category?: string; title?: string; employeeId?: string; expiresAt?: string },
  ) {
    if (this.access(user) === 'OWN' && meta.folder !== 'EMPLOYEE') {
      throw new ForbiddenException();
    }
    assertSafeUpload(file);
    const saved = await this.storage.save(user.companyId, 'library', file.originalname, file.buffer);
    const doc = await this.prisma.libraryDocument.create({
      data: {
        companyId: user.companyId,
        folder: meta.folder || 'COMPANY',
        category: meta.category || 'GENERAL',
        title: meta.title || file.originalname,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey: saved.storageKey,
        employeeId: meta.employeeId || user.employeeId,
        expiresAt: meta.expiresAt ? new Date(meta.expiresAt) : undefined,
        uploadedBy: user.id,
        versions: {
          create: {
            version: 1,
            fileName: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            storageKey: saved.storageKey,
            createdBy: user.id,
          },
        },
      },
    });
    await this.audit.log({
      companyId: user.companyId,
      actorId: user.id,
      action: AuditAction.CREATE,
      entityType: 'LibraryDocument',
      entityId: doc.id,
    });
    return doc;
  }

  async rename(user: AuthUser, id: string, title: string) {
    const doc = await this.get(user, id);
    return this.prisma.libraryDocument.update({ where: { id: doc.id }, data: { title } });
  }

  async remove(user: AuthUser, id: string) {
    const doc = await this.get(user, id);
    if (this.access(user) === 'OWN' && doc.uploadedBy !== user.id) throw new ForbiddenException();
    await this.prisma.libraryDocument.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({
      companyId: user.companyId,
      actorId: user.id,
      action: AuditAction.DELETE,
      entityType: 'LibraryDocument',
      entityId: id,
    });
    return { ok: true };
  }

  async versions(user: AuthUser, id: string) {
    const doc = await this.get(user, id);
    return this.prisma.libraryDocumentVersion.findMany({
      where: { documentId: doc.id },
      orderBy: { version: 'desc' },
    });
  }

  async download(user: AuthUser, id: string) {
    const doc = await this.get(user, id);
    const stream = this.storage.openReadStream(doc.storageKey);
    return { file: new StreamableFile(stream), fileName: doc.fileName, mimeType: doc.mimeType };
  }

  private async get(user: AuthUser, id: string) {
    const doc = await this.prisma.libraryDocument.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
    });
    if (!doc) throw new NotFoundException('Document not found');
    this.assertCanSee(user, doc);
    return doc;
  }
}
