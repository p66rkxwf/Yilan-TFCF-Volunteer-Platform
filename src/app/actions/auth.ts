'use server'

import { createClient } from '@/lib/supabase/server'
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
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const name = formData.get('name') as string
  const birthday = formData.get('birthday') as string
  const region = formData.get('region') as string
  const socialWorkerId = formData.get('socialWorkerId') as string

  if (!email || !password || !name || !birthday) {
    return { error: '請填寫所有必填欄位' }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name,
        birthday: birthday,
        region: region || null,
        assigned_worker_id: socialWorkerId || null,
      },
    },
  })

  if (error) {
    // 處理社工驗證觸發器丟出的錯誤或其他註冊錯誤
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