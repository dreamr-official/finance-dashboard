export async function getResponseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  if (typeof body?.error === "string") return body.error;
  if (Array.isArray(body?.error)) {
    return body.error
      .map((issue: { path?: unknown[]; message?: string }) => {
        const path = Array.isArray(issue.path) ? issue.path.join(".") : "";
        return `${path ? `${path}: ` : ""}${issue.message ?? "Invalid value"}`;
      })
      .join("; ");
  }
  return fallback;
}
