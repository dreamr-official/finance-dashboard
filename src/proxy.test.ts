import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  signOut: vi.fn(),
  getAuthenticatorAssuranceLevel: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: authMocks.getUser,
      signOut: authMocks.signOut,
      mfa: {
        getAuthenticatorAssuranceLevel: authMocks.getAuthenticatorAssuranceLevel,
      },
    },
  })),
}));

import { config, proxy } from "./proxy";

describe("proxy authorization", () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-key");
    authMocks.getUser.mockReset();
    authMocks.signOut.mockReset().mockResolvedValue({ error: null });
    authMocks.getAuthenticatorAssuranceLevel
      .mockReset()
      .mockResolvedValue({
        data: { currentLevel: "aal1", nextLevel: "aal1" },
        error: null,
      });
  });

  it("does not redirect unauthenticated cron requests", async () => {
    authMocks.getUser.mockResolvedValue({ data: { user: null } });
    const response = await proxy(
      new NextRequest("http://localhost/api/cron/daily-snapshot"),
    );
    expect(response.headers.get("location")).toBeNull();
  });

  it("keeps prefix-like cron paths gated", async () => {
    authMocks.getUser.mockResolvedValue({ data: { user: null } });
    const response = await proxy(new NextRequest("http://localhost/api/cronx"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });

  it("excludes root service worker and manifest paths from the matcher", () => {
    const matcher = new RegExp(config.matcher[0]);
    expect(matcher.test("/sw.js")).toBe(false);
    expect(matcher.test("/manifest.webmanifest")).toBe(false);
    expect(matcher.test("/overview")).toBe(true);
  });

  it("signs out and does not redirect an unauthorized login session", async () => {
    authMocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const response = await proxy(
      new NextRequest("http://localhost/login?error=not_authorized"),
    );
    expect(authMocks.signOut).toHaveBeenCalledOnce();
    expect(response.headers.get("location")).toBeNull();
  });

  it("requires MFA for API requests when the session is only AAL1", async () => {
    authMocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    authMocks.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });
    const response = await proxy(new NextRequest("http://localhost/api/accounts"));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "MFA required" });
  });

  it("leaves public auth endpoints accessible to signed-in AAL1 sessions", async () => {
    authMocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    authMocks.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });
    const response = await proxy(
      new NextRequest("http://localhost/api/auth/signout"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
