'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// 登入功能
export async function login(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: '請提供帳號與密碼' }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: '登入失敗：帳號或密碼錯誤' }
  }

  revalidatePath('/', 'layout')
  redirect('/volunteer/dashboard')
}

// 註冊功能
export async function register(formData: FormData) {
  const account = formData.get('account') as string
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const name = formData.get('name') as string
  const birthday = formData.get('birthday') as string
  const region = formData.get('region') as string
  const socialWorkerId = formData.get('socialWorkerId') as string

  if (!account || !email || !password || !name || !birthday) {
    return { error: '請填寫所有必填欄位' }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        account: account,
        full_name: name,
        birthday: birthday,
        region: region || null, // 若為空字串，將轉換為 null 寫入
        assigned_worker_id: socialWorkerId || null, // 若為空字串，將轉換為 null 寫入
      },
    },
  })

  if (error) {
    return { error: `註冊失敗：${error.message}` }
  }

  revalidatePath('/', 'layout')
  redirect('/login?registered=true')
}

// 登出功能
export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

// 獲取社工名單功能 (使用 Service Role Key 繞過 RLS)
const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function getSocialWorkers() {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name')
    .in('role', ['internal_staff', 'unit_admin'])
    .eq('position', 'social_worker')
    // 註：若你的 profiles 表中沒有 status 欄位，請將下一行註解或刪除，以免報錯
    // .eq('status', 'active') 
    .order('full_name')

  if (error) {
    console.error('獲取社工名單失敗:', error.message)
    return []
  }

  return data || []
}