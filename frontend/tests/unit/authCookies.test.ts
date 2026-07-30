import { getSecureCookie, getSessionCookieName } from "../../lib/authCookies";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("getSecureCookie", () => {
  it("is true when VERCEL is set", () => {
    process.env.VERCEL = "1";
    delete process.env.NEXTAUTH_URL;
    expect(getSecureCookie()).toBe(true);
  });

  it("is true when NEXTAUTH_URL is https, even without VERCEL", () => {
    delete process.env.VERCEL;
    process.env.NEXTAUTH_URL = "https://example.com";
    expect(getSecureCookie()).toBe(true);
  });

  it("is false when neither VERCEL nor an https NEXTAUTH_URL is set", () => {
    delete process.env.VERCEL;
    delete process.env.NEXTAUTH_URL;
    expect(getSecureCookie()).toBe(false);
  });

  it("is false for a plain http NEXTAUTH_URL without VERCEL", () => {
    delete process.env.VERCEL;
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    expect(getSecureCookie()).toBe(false);
  });
});

describe("getSessionCookieName", () => {
  it("uses the __Secure- prefix when secureCookie is true", () => {
    expect(getSessionCookieName(true)).toBe("__Secure-next-auth.session-token");
  });

  it("has no prefix when secureCookie is false", () => {
    expect(getSessionCookieName(false)).toBe("next-auth.session-token");
  });
});
