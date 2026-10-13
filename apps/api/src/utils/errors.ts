export class AppError extends Error {
  constructor(public status: number, message: string, public code = "ERROR") {
    super(message);
  }
}
export const badRequest = (m: string) => new AppError(400, m, "BAD_REQUEST");
export const notFound = (m = "Not found") => new AppError(404, m, "NOT_FOUND");
export const unauthorized = (m = "Authentication required") => new AppError(401, m, "UNAUTHORIZED");
