import { isDemoMode } from "./env";
import type { Role } from "./types";

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
}

/**
 * Resolves the current user. In demo mode (no Supabase) returns a fixed
 * demo admin — the UI labels this clearly. With Supabase configured, the
 * role comes from the authorized_users table (RLS-enforced).
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (isDemoMode()) {
    return { id: "demo-admin", email: "you@example.com", role: "admin" };
  }
  const { createClient } = await import("./supabase/server");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("authorized_users")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (!data) return null; // authenticated but not allowlisted
  return { id: user.id, email: user.email ?? "", role: data.role as Role };
}

/** Throws unless the current user is an admin. Use in every mutating route. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError(401, "Not authenticated");
  if (user.role !== "admin") throw new AuthError(403, "Admin role required");
  return user;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError(401, "Not authenticated");
  return user;
}

export class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function authErrorResponse(e: unknown) {
  if (e instanceof AuthError) {
    return Response.json({ error: e.message }, { status: e.status });
  }
  throw e;
}
