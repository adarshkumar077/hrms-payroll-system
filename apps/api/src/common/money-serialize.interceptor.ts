import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { serializeMoney } from './money';

/**
 * Money columns are DECIMAL(14,2) and Prisma returns them as Prisma.Decimal, whose
 * default JSON form is a string. The web client expects numbers, so every response
 * body is walked and each Decimal is replaced by a 2dp JS number.
 */
@Injectable()
export class MoneySerializeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((body) => serializeMoney(body)));
  }
}
