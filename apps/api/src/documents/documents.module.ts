import { Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { LibraryDocumentsService } from './library-documents.service';
import { LibraryDocumentsController } from './library-documents.controller';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';

@Module({
  controllers: [DocumentsController, LibraryDocumentsController, StorageController],
  providers: [DocumentsService, LibraryDocumentsService, StorageService],
  exports: [DocumentsService, LibraryDocumentsService, StorageService],
})
export class DocumentsModule {}
