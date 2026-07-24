"use client";

// 新增職員（僅系統管理員）：伺服器端 Admin API 建帳號並寫入 staff_profiles。

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { useAdminProfile } from "../../admin-context";
import { createStaff } from "@/lib/actions/admin-users";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel, Field, inputClass } from "@/components/admin/ui";
import { Select } from "@/components/ui/select";
import { STAFF_ROLE, STAFF_JOB_TITLE } from "@/lib/admin/labels";
import { YILAN_REGIONS } from "@/lib/types/database";
import { isValidEmail, isValidTaiwanPhone, isValidUsername } from "@/lib/validation";
import type { StaffRole, StaffJobTitle } from "@/lib/types/database";

export default function NewStaffPage() {
  const router = useRouter();
  const toast = useToast();
  const profile = useAdminProfile();

  const [form, setForm] = useState({
    fullName: "",
    username: "",
    email: "",
    phone: "",
    role: "staff" as StaffRole,
    jobTitle: "other" as StaffJobTitle,
    region: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({});

  // 非系統管理員不應進入此頁；導回名冊。
  useEffect(() => {
    if (profile.role !== "system_admin") {
      toast.error("僅系統管理員可新增職員");
      router.replace("/admin/staff");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: typeof errors = {};
    if (!form.username.trim()) nextErrors.username = "請輸入帳號";
    else if (!isValidUsername(form.username)) {
      nextErrors.username = "帳號需為 4～30 碼英數字或 . _ -";
    }
    if (!form.email.trim()) nextErrors.email = "請輸入 Email";
    else if (!isValidEmail(form.email)) nextErrors.email = "Email 格式不正確";
    if (!form.fullName.trim()) nextErrors.fullName = "請輸入姓名";
    if (!form.phone.trim()) nextErrors.phone = "請輸入聯絡電話";
    else if (!isValidTaiwanPhone(form.phone)) {
      nextErrors.phone = "電話格式不正確（例：0912345678 或 03-1234567）";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setIsSaving(true);
    const result = await createStaff(form);
    setIsSaving(false);
    if (result.error) return void toast.error(result.error);
    toast.success("職員帳號已建立");
    router.push("/admin/staff");
  };

  return (
    <>
      <PageHeader
        title="新增職員"

        backHref="/admin/staff"
        backLabel="職員管理"
      />

      <div className="flex-1 p-4 sm:p-6">
        <form onSubmit={handleSubmit} className="max-w-3xl space-y-5">
          <Panel title="登入資訊">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="帳號" required error={errors.username}>
                <input
                  className={inputClass}
                  value={form.username}
                  onChange={(e) => set("username", e.target.value)}
                  autoComplete="off"
                />
              </Field>
              <Field label="Email" required error={errors.email}>
                <input
                  type="email"
                  className={inputClass}
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  autoComplete="off"
                />
              </Field>
            </div>
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              初始密碼將自動設為「帳號」，該職員首次登入時系統會強制要求變更密碼。
            </p>
          </Panel>

          <Panel title="基本資料與權限">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="姓名" required error={errors.fullName}>
                <input
                  className={inputClass}
                  value={form.fullName}
                  onChange={(e) => set("fullName", e.target.value)}
                />
              </Field>
              <Field label="聯絡電話" required error={errors.phone} hint="負責人電話會公開於前台。">
                <input
                  className={inputClass}
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </Field>
              <Field label="角色" required>
                <Select
                  value={form.role}
                  onValueChange={(v) => set("role", v)}
                  options={Object.entries(STAFF_ROLE).map(([value, label]) => ({ value, label }))}
                />
              </Field>
              <Field label="職稱" required hint="社工才能被指派為學生的負責社工。">
                <Select
                  value={form.jobTitle}
                  onValueChange={(v) => set("jobTitle", v)}
                  options={Object.entries(STAFF_JOB_TITLE).map(([value, label]) => ({ value, label }))}
                />
              </Field>
              <Field label="地區">
                <Select
                  value={form.region}
                  onValueChange={(v) => set("region", v)}
                  placeholder="請選擇地區"
                  options={YILAN_REGIONS.map((r) => ({ value: r, label: r }))}
                />
              </Field>
            </div>
          </Panel>

          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" isLoading={isSaving}>
              建立職員帳號
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => router.back()}>
              取消
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
