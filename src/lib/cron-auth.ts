import 'server-only';
import { env } from './env';

export function isCronAuthorized(req: Request): boolean {
  const header = req.headers.get('authorization') ?? '';
  return header === `Bearer ${env.CRON_SECRET}`;
}
