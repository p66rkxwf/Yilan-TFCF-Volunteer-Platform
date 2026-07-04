"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface AuthContextValue {
  user: User | null;
  isAdmin: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAdmin: false,
  isLoading: true,
});

// 全站唯一的登入狀態來源，取代先前 Header 與各頁面各自呼叫
// getUser() 的重複驗證。只訂閱 onAuthStateChange（訂閱當下會用本地
// session 立即觸發一次，不需另外呼叫 getSession()），角色查詢依
// user id 去重複，同一使用者不會重複查。保持即時性（登入/登出後
// UI 立即切換，不需整頁重新整理）。
//
// 安全提醒：這裡的 user/isAdmin 僅供「UI 顯示」用（要不要顯示後台
// 連結、登入/登出按鈕）。實際的存取控制邊界仍在 middleware、RLS
// 與各 Server Action 內的 getUser() 驗證，不受此 context 影響。
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // 只在 onAuthStateChange callback 內做「同步」的狀態更新，
  // 絕不在此 callback 內 await 任何 Supabase 呼叫。supabase-js 在觸發
  // auth 事件時持有內部鎖，callback 內若再呼叫會讀 session 的方法
  // （例如資料查詢）會與該鎖互相死結，導致「登入後要刷新才會更新」。
  // 訂閱當下會立即用目前 session 觸發一次（INITIAL_SESSION）。
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  // 是否為後台使用者的判斷拆到獨立 effect：V2 沒有單一 role 欄位，
  // 職員/志工分成兩張互斥的表，只要在 staff_profiles 裡且在職即視為
  // 後台使用者。依 user.id 觸發 → token 刷新（同一 id）不會重複查。
  useEffect(() => {
    const uid = user?.id;
    if (!uid) {
      setIsAdmin(false);
      return;
    }

    let active = true;
    supabase
      .from("staff_profiles")
      .select("status")
      .eq("id", uid)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setIsAdmin(!!data && data.status === "active");
      });

    return () => {
      active = false;
    };
  }, [supabase, user?.id]);

  return (
    <AuthContext.Provider value={{ user, isAdmin, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
