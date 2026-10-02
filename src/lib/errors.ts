import { TarkovApiError } from '../api/client'

export function describeError(error: unknown): string {
  if (error instanceof TarkovApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong while loading data.'
}
