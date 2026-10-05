/**
 * Returns the `name` of a thrown value (AWS SDK errors carry the Cognito
 * exception type there, e.g. 'CodeMismatchException'). Routes match on this,
 * never on message text, and log only this, never the raw message.
 */
export function errorName(err: unknown): string {
  if (err instanceof Error) return err.name;
  if (typeof err === 'object' && err !== null && 'name' in err) {
    const { name } = err as { name: unknown };
    if (typeof name === 'string') return name;
  }
  return 'UnknownError';
}
