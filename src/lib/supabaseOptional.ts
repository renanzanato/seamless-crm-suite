export function isOptionalSchemaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: string; message?: string; details?: string; hint?: string };
  const code = record.code || '';
  const text = [record.message, record.details, record.hint].filter(Boolean).join(' ');

  return (
    ['42P01', '42703', 'PGRST200', 'PGRST204', 'PGRST205'].includes(code) ||
    /relation .* does not exist/i.test(text) ||
    /column .* does not exist/i.test(text) ||
    /could not find .* in the schema cache/i.test(text) ||
    /does not exist in the schema cache/i.test(text)
  );
}

export function returnEmptyOnOptionalSchema<T>(error: unknown, fallback: T): T {
  if (isOptionalSchemaError(error)) return fallback;
  throw error;
}
