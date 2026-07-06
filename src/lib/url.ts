// Only allow same-origin relative paths as a redirect target.
// Resolves the value with the URL parser (the same normalization the router
// applies), so absolute URLs, protocol-relative "//host", userinfo tricks like
// "@evil.com", and backslash/tab tricks like "/\\evil.com" that escape to
// another origin are rejected — the result always stays on our own origin.
export function safeInternalPath(raw: string | null): string {
  if (!raw) return "/";
  try {
    const base = "http://internal.invalid";
    const url = new URL(raw, base);
    if (url.origin === base) return url.pathname + url.search + url.hash;
  } catch {
    // fall through
  }
  return "/";
}
