'use server'

import { createClient } from '@supabase/supabase-js'

// 使用 Service Role Key 建立管理員 Client (嚴禁在 Client Component 使用)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function getSocialWorkers() {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name')
    .in('role', ['internal_staff', 'unit_admin'])
    .eq('position', 'social_worker')
    .eq('status', 'active') // 僅撈取狀態為正常的社工
    .order('full_name')

  if (error) {
    console.error('獲取社工名單失敗:', error.message)
    return []
  }

  return data || []
}