import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { AuditAction, DocumentTypeCode, RoleCode } from '@prisma/client';
import { createReadStream, existsSync } from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import { StorageService } from './storage.service';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  private isHrOrCeo(user: AuthUser) {
    return user.roles.includes(RoleCode.CEO) || user.roles.includes(RoleCode.HR);
  }

  async listTypes(companyId: string) {
    return this.prisma.documentType.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  async ensureDefaultTypes(companyId: string) {
    const defs: { code: DocumentTypeCode; name: string }[] = [
      { code: DocumentTypeCode.AADHAAR, name: 'Aadhaar' },
      { code: DocumentTypeCode.PAN, name: 'PAN' },
      { code: DocumentTypeCode.PASSPORT, name: 'Passport' },
      { code: DocumentTypeCode.RESUME, name: 'Resume' },
      { code: DocumentTypeCode.EDUCATIONAL, name: 'Educational' },
      { code: DocumentTypeCode.OFFER, name: 'Offer Letter' },
      { code: DocumentTypeCode.APPOINTMENT, name: 'Appointment Letter' },
      { code: DocumentTypeCode.INCREMENT, name: 'Increment Letter' },
      { code: DocumentTypeCode.EXPERIENCE, name: 'Experience Letter' },
      { code: DocumentTypeCode.RELIEVING, name: 'Relieving Letter' },
      { code: DocumentTypeCode.BANK, name: 'Bank Proof' },
      { code: DocumentTypeCode.CUSTOM, name: 'Custom' },
    ];
    for (const d of defs) {
      await this.prisma.documentType.upsert({
        where: { companyId_code: { companyId, code: d.code } },
        create: { companyId, code: d.code, name: d.name, isSystem: true },
        update: { name: d.name },
      });
    }
    return this.listTypes(companyId);
  }

  async listForEmployee(actor: AuthUser, employeeId: string) {
    if (!this.isHrOrCeo(actor) && actor.employeeId !== employeeId) {
      throw new ForbiddenException();
    }
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId: actor.companyId },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    return this.prisma.employeeDocument.findMany({
      where: { employeeId, companyId: actor.companyId, deletedAt: null },
      include: { documentType: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listMine(actor: AuthUser) {
    if (!actor.employeeId) throw new ForbiddenException('No employee profile linked');
    return this.listForEmployee(actor, actor.employeeId);
  }

  async upload(
    actor: AuthUser,
    employeeId: string,
    file: Express.Multer.File | undefined,
    documentTypeCode: string,
    title?: string,
    notes?: string,
  ) {
    if (!this.isHrOrCeo(actor)) throw new ForbiddenException();
    if (!file) throw new BadRequestException('File is required');

    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId: actor.companyId },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    const code = documentTypeCode.toUpperCase() as DocumentTypeCode;
    if (!Object.values(DocumentTypeCode).includes(code)) {
      throw new BadRequestException('Invalid document type');
    }

    let docType = await this.prisma.documentType.findUnique({
      where: { companyId_code: { companyId: actor.companyId, code } },
    });
    if (!docType) {
      await this.ensureDefaultTypes(actor.companyId);
      docType = await this.prisma.documentType.findUniqueOrThrow({
        where: { companyId_code: { companyId: actor.companyId, code } },
      });
    }

    const saved = await this.storage.saveLocal(
      actor.companyId,
      employeeId,
      file.originalname,
      file.buffer,
    );

    const doc = await this.prisma.employeeDocument.create({
      data: {
        companyId: actor.companyId,
        employeeId,
        documentTypeId: docType.id,
        title: title ?? file.originalname,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey: saved.storageKey,
        storageProvider: saved.storageProvider,
        uploadedBy: actor.id,
        notes,
      },
      include: { documentType: true },
    });

    await this.audit.log({
      companyId: actor.companyId,
      actorId: actor.id,
      action: AuditAction.CREATE,
      entityType: 'EmployeeDocument',
      entityId: doc.id,
      metadata: { employeeId, type: code, fileName: file.originalname },
    });

    return doc;
  }

  private openDocumentStream(storageKey: string) {
    const abs = this.storage.absolutePath(storageKey);
    if (!existsSync(abs)) throw new NotFoundException('Document file not found');
    return createReadStream(abs);
  }

  async download(actor: AuthUser, documentId: string) {
    const doc = await this.prisma.employeeDocument.findFirst({
      where: { id: documentId, companyId: actor.companyId, deletedAt: null },
    });
    if (!doc) throw new NotFoundException('Document not found');

    if (!this.isHrOrCeo(actor) && actor.employeeId !== doc.employeeId) {
      throw new ForbiddenException();
    }

    const stream = this.openDocumentStream(doc.storageKey);
    return {
      file: new StreamableFile(stream),
      fileName: doc.fileName,
      mimeType: doc.mimeType,
    };
  }

  async softDelete(actor: AuthUser, documentId: string) {
    if (!this.isHrOrCeo(actor)) throw new ForbiddenException();
    const doc = await this.prisma.employeeDocument.findFirst({
      where: { id: documentId, companyId: actor.companyId, deletedAt: null },
    });
    if (!doc) throw new NotFoundException('Document not found');

    this.storage.deleteLocal(doc.storageKey);
    await this.prisma.employeeDocument.delete({ where: { id: documentId } });

    await this.audit.log({
      companyId: actor.companyId,
      actorId: actor.id,
      action: AuditAction.DELETE,
      entityType: 'EmployeeDocument',
      entityId: documentId,
      metadata: { fileName: doc.fileName, employeeId: doc.employeeId },
    });

    return { message: 'Document deleted' };
  }

  async replace(
    actor: AuthUser,
    documentId: string,
    file: Express.Multer.File | undefined,
    title?: string,
  ) {
    if (!this.isHrOrCeo(actor)) throw new ForbiddenException();
    if (!file) throw new BadRequestException('File is required');

    const doc = await this.prisma.employeeDocument.findFirst({
      where: { id: documentId, companyId: actor.companyId, deletedAt: null },
    });
    if (!doc) throw new NotFoundException('Document not found');

    const saved = await this.storage.saveLocal(
      actor.companyId,
      doc.employeeId,
      file.originalname,
      file.buffer,
    );

    const oldKey = doc.storageKey;
    const updated = await this.prisma.employeeDocument.update({
      where: { id: documentId },
      data: {
        title: title ?? file.originalname,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey: saved.storageKey,
        storageProvider: saved.storageProvider,
        uploadedBy: actor.id,
      },
      include: { documentType: true },
    });

    this.storage.deleteLocal(oldKey);

    await this.audit.log({
      companyId: actor.companyId,
      actorId: actor.id,
      action: AuditAction.UPDATE,
      entityType: 'EmployeeDocument',
      entityId: documentId,
      metadata: { event: 'document_replaced', fileName: file.originalname },
    });

    return updated;
  }

  async view(actor: AuthUser, documentId: string) {
    const doc = await this.prisma.employeeDocument.findFirst({
      where: { id: documentId, companyId: actor.companyId, deletedAt: null },
    });
    if (!doc) throw new NotFoundException('Document not found');

    if (!this.isHrOrCeo(actor) && actor.employeeId !== doc.employeeId) {
      throw new ForbiddenException();
    }

    const stream = this.openDocumentStream(doc.storageKey);
    return {
      file: new StreamableFile(stream),
      fileName: doc.fileName,
      mimeType: doc.mimeType,
    };
  }
}
