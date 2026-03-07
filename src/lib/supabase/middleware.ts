import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          supabaseResponse = NextResponse.next({
            request: { headers: request.headers },
          })
          supabaseResponse.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          supabaseResponse = NextResponse.next({
            request: { headers: request.headers },
          })
          supabaseResponse.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // 刷新 Session 並獲取當前用戶
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  
  // 定義路由規則
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register') || pathname.startsWith('/forgot-password')
  const isProtectedPage = pathname.startsWith('/volunteer') || pathname.startsWith('/manage')

  // 若未登入且訪問受保護頁面，導向登入頁
  if (!user && isProtectedPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // 若已登入且訪問認證頁面，導向儀表板
  if (user && isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/volunteer/dashboard' // 暫時統一導向志工儀表板，後續可依角色區分
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}