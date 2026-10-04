// Reaching this means a union grew a member some `switch` does not handle (TS-06).
export function assertNever(value: never, context?: string): never {
  throw new Error(`Unhandled variant${context ? ` in ${context}` : ''}: ${JSON.stringify(value)}`);
}
