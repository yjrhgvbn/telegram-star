import { ZodError } from "zod";

export function formatValidationError(error: unknown, fallback: string): string {
  if (!(error instanceof ZodError)) {
    return fallback;
  }

  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    })
    .join("; ");
}
