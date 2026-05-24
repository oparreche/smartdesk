import 'server-only';

export type JobHandlerContext = {
  jobId: string;
  organizationId: string | null;
  attempts: number;
  maxAttempts: number;
};

export type JobHandler<P = unknown> = (
  payload: P,
  ctx: JobHandlerContext,
) => Promise<unknown>;

const handlers = new Map<string, JobHandler>();

export function registerJobHandler<P>(type: string, handler: JobHandler<P>): void {
  handlers.set(type, handler as JobHandler);
}

export function getJobHandler(type: string): JobHandler | undefined {
  return handlers.get(type);
}

export function listRegisteredTypes(): string[] {
  return Array.from(handlers.keys()).sort();
}
