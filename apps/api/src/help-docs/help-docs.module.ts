import { Module } from '@nestjs/common';
import { HelpDocsController } from './help-docs.controller';

@Module({
  controllers: [HelpDocsController],
})
export class HelpDocsModule {}
