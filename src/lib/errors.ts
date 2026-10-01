import { GroupError } from '../core/groups'

export function errorMessage(error: unknown): string {
  return error instanceof GroupError ? error.message : new GroupError('unknown').message
}
