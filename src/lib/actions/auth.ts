"use server";

import { createClient } from "@/lib/supabase/server";
import {
  getBirthdayValidationError,
  normalizeBirthdayForSubmit,
} from "@/lib/birthday";
import { redirect } from "next/navigation";
import type { YilanRegion } from "@/lib/types/database";

export interface AuthResult {
  error?: string;
  success?: boolean;
}

export async function signIn(formData: {
  account: string;
  password: string;
}): Promise<AuthResult> {
  const supabase = await createClient();
  const input = formData.account.trim();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);

  let email: string;

  if (isEmail) {
    email = input;
  } else {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("account", input)
      .single();

    if (!profile) {
      return { error: "帳號不存在，請確認後再試。" };
    }
    email = profile.email;
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: formData.password,
  });

  if (error) {
    return { error: "帳號或密碼錯誤，請重新輸入。" };
  }

  return { success: true };
}

export async function signUp(formData: {
  account: string;
  password: string;
  name: string;
  email: string;
  region?: YilanRegion | "";
  socialWorkerId?: string;
  birthday: string;
}): Promise<AuthResult> {
  const supabase = await createClient();
  const normalizedBirthday = normalizeBirthdayForSubmit(formData.birthday);
  const birthdayError = getBirthdayValidationError(normalizedBirthday, {
    required: true,
  });

  if (birthdayError) {
    return { error: birthdayError };
  }

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("account", formData.account)
    .single();

  if (existing) {
    return { error: "此帳號已被使用，請選擇其他帳號。" };
  }

  const { error: authError } = await supabase.auth.signUp({
    email: formData.email,
    password: formData.password,
    options: {
      data: {
        account: formData.account,
        full_name: formData.name,
        birthday: normalizedBirthday,
        ...(formData.region ? { region: formData.region } : {}),
        assigned_worker_id: formData.socialWorkerId || "",
      },
    },
  });

  if (authError) {
    if (authError.message.includes("already registered")) {
      return { error: "此 Email 已被註冊。" };
    }
    return { error: `註冊失敗：${authError.message}` };
  }

  return { success: true };
}

export async function resetPassword(email: string): Promise<AuthResult> {
  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : ""}/auth/callback?next=/profile`,
  });

  if (error) {
    return { error: `發送失敗：${error.message}` };
  }

  return { success: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function updatePassword(newPassword: string): Promise<AuthResult> {
  if (newPassword.length < 8) {
    return { error: "密碼至少需要 8 個字元。" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) return { error: `密碼更新失敗：${error.message}` };
  return { success: true };
}

export async function updateEmail(newEmail: string): Promise<AuthResult> {
  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return { error: "請輸入有效的 Email 地址。" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ email: newEmail });

  if (error) return { error: `Email 更新失敗：${error.message}` };
  return { success: true };
}

export async function deleteAccount(): Promise<AuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "尚未登入。" };

  const { error } = await supabase
    .from("profiles")
    .update({ status: "blacklisted" })
    .eq("id", user.id);

  if (error) return { error: `帳號停用失敗：${error.message}` };

  await supabase.auth.signOut();
  return { success: true };
}
