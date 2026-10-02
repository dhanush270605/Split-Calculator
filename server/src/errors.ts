export class AppError extends Error {
  constructor(public status: number, message: string, public code = 'ERROR', public details?: unknown) {
    super(message);
  }
}
export const badRequest = (m: string, details?: unknown) => new AppError(400, m, 'BAD_REQUEST', details);
export const unauthorized = (m = 'Authentication required') => new AppError(401, m, 'UNAUTHORIZED');
export const forbidden = (m = 'You do not have permission to do that') => new AppError(403, m, 'FORBIDDEN');
export const notFound = (m = 'Not found') => new AppError(404, m, 'NOT_FOUND');
export const conflict = (m: string, details?: unknown) => new AppError(409, m, 'CONFLICT', details);
