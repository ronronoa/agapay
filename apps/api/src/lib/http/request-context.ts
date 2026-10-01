import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

// Avoids threading requestId through every service signature (TS-20).
export interface RequestContext {
  requestId: string;
  actorId?: string;
  actorRole?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function newRequestId(): string {
  return randomUUID();
}

export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}

export function getRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}
