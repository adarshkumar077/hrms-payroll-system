import { Module } from '@nestjs/common';
import { DataExchangeController } from './data-exchange.controller';
import { DataExchangeService } from './data-exchange.service';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [ReportsModule],
  controllers: [DataExchangeController],
  providers: [DataExchangeService],
})
export class DataExchangeModule {}
