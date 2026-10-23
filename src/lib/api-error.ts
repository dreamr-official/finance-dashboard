const INVALID_INPUT_CODES = new Set(["22007", "22008", "23503", "23514"]);

export function apiErrorResponse(error: { code?: string; message?: string }) {
  const status = error.code && INVALID_INPUT_CODES.has(error.code) ? 400 : 500;
  return Response.json(
    { error: status === 400 ? "Invalid request" : error.message ?? "Request failed" },
    { status },
  );
}
