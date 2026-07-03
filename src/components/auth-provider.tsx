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

  useEffect(() => {
    let active = true;
    // 追蹤上次查過角色的 user id，避免同一位使用者的 token 刷新等
    // 事件重複觸發不必要的 profiles.role 查詢。
    let lastRoleCheckedUserId: string | null = null;

    const applyUser = async (nextUser: User | null) => {
      if (!active) return;
      setUser(nextUser);

      if (!nextUser) {
        lastRoleCheckedUserId = null;
        setIsAdmin(false);
        return;
      }

      if (nextUser.id === lastRoleCheckedUserId) return;
      lastRoleCheckedUserId = nextUser.id;

      // V2 沒有單一 role 欄位：職員/志工分成兩張互斥的表，
      // 只要在 staff_profiles 裡且在職，就視為後台使用者。
      const { data: staff } = await supabase
        .from("staff_profiles")
        .select("status")
        .eq("id", nextUser.id)
        .maybeSingle();

      if (!active) return;
      setIsAdmin(!!staff && staff.status === "active");
    };

    // onAuthStateChange 訂閱時會立即用目前的 session 觸發一次
    // （INITIAL_SESSION 事件），不需要另外呼叫 getSession()。
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user ?? null).then(() => {
        if (active) setIsLoading(false);
      });
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  return (
    <AuthContext.Provider value={{ user, isAdmin, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
