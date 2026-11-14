import { Module } from '@nestjs/common';
import { StatutoryRulesService } from './statutory-rules.service';

@Module({
  providers: [StatutoryRulesService],
  exports: [StatutoryRulesService],
})
export class StatutoryModule {}
