import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// 統一套用 HTTP 安全標頭（縱深防禦）。套在每一個回傳分支（含 redirect），
// 確保任何回應都帶標頭。CSP 採「強制」模式：script/style 保留 'unsafe-inline'
// 以相容 Next/RSC 的 inline script/style，故本站既有行為不受影響；
// object-src 'none'、base-uri 'self'、form-action 'self'、
// frame-ancestors 'none' 與各 *-src 白名單自此「實際生效」而非僅回報。
// 資源皆 same-origin：字型自 /fonts、無外部圖片（img 僅 self/data/blob）、
// connect-src 放行 Supabase（前端 anon client 直連 *.supabase.co）、
// script/frame 放行 Cloudflare Turnstile。
// 註：待 RSC inline-script 的 nonce 方案成熟後，可再移除 script 'unsafe-inline'。

// 本 middleware 在 `next dev` 也會執行，因此 CSP 對開發環境同樣生效。React 的
// dev build 需要 eval() 來還原跨環境的 callstack，Turbopack 的 HMR 亦然，少了
// 'unsafe-eval' 會整頁報錯。production build 用不到，故僅於開發環境放行。
const isDevelopment = process.env.NODE_ENV !== "production";

function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains"
  );
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      // challenges.cloudflare.com：Cloudflare Turnstile（/support 人機驗證，選用）
      // 'unsafe-eval' 僅開發環境放行（見上方 isDevelopment）。若日後有相依套件在
      // 正式環境的執行期用到 eval／new Function，瀏覽器 console 會直接報 CSP 違規。
      `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com`,
      "frame-src 'self' https://challenges.cloudflare.com",
      // Turnstile 部分挑戰會以 blob: URL 起 Web Worker；無 worker-src 時會
      // fallback 到 default-src 'self' 而被強制 CSP 擋下，widget 將驗證失敗。
      "worker-src 'self' blob:",
      // challenges.cloudflare.com：Turnstile widget 在瀏覽器端亦會對此發出 API 請求，
      // CSP 強制後若不放行會擋掉人機驗證流程（與 script-src/frame-src 一致）。
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com",
    ].join("; ")
  );
  return response;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 首次登入強制改密碼：批量建立／管理員建立／管理員重置密碼（系統代設臨時密碼）者，
  // must_change_password=true，登入後一律導到 /change-password，改完才放行其他頁面。
  // /change-password 本頁與登出動作不攔截，避免死鎖。
  if (user && !request.nextUrl.pathname.startsWith("/change-password")) {
    const { data: mustChange } = await supabase.rpc("fn_must_change_password");
    if (mustChange === true) {
      const url = request.nextUrl.clone();
      url.pathname = "/change-password";
      url.search = "";
      return applySecurityHeaders(NextResponse.redirect(url));
    }
  }

  const isAuthPage =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/register") ||
    request.nextUrl.pathname.startsWith("/forgot-password");

  const isProtectedPage =
    request.nextUrl.pathname.startsWith("/profile") ||
    request.nextUrl.pathname.startsWith("/volunteer") ||
    request.nextUrl.pathname.startsWith("/admin");

  if (!user && isProtectedPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", request.nextUrl.pathname);
    return applySecurityHeaders(NextResponse.redirect(url));
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return applySecurityHeaders(NextResponse.redirect(url));
  }

  return applySecurityHeaders(supabaseResponse);
}
