import type { ErrorCode } from './generated/schema.js';

/** Server-only superset of the wire ErrorCode. CLIENT_GONE never goes over the wire. */
export type ServerErrorCode = ErrorCode | 'CLIENT_GONE';

export class AgentError extends Error {
  constructor(
    public code: ServerErrorCode,
    message: string,
    public retryable = false,
    /** Used only for pre-stream JSON errors. */
    public status = 500
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

/** Convert to the wire shape. CLIENT_GONE is never passed here (the route handles it). */
export const toWire = (e: AgentError): { code: ErrorCode; message: string; retryable: boolean } => ({
  code: e.code as ErrorCode,
  message: e.message,
  retryable: e.retryable,
});
