"use client";

// 手動新增學生：伺服器端建帳號（Admin API），直接為在職狀態，須指定負責社工。

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel, Field, inputClass } from "@/components/admin/ui";
import { Select } from "@/components/ui/select";
import { createVolunteer } from "@/lib/actions/admin-volunteers";
import { GRADE_LEVEL_LABELS, YILAN_REGIONS } from "@/lib/types/database";
import type { GradeLevel } from "@/lib/types/database";

interface WorkerOption {
  id: string;
  full_name: string;
}

export default function NewVolunteerPage() {
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();

  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [form, setForm] = useState({
    fullName: "",
    username: "",
    email: "",
    phone: "",
    birthDate: "",
    grade: "university" as GradeLevel,
    region: "",
    assignedWorkerId: "",
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("staff_profiles")
        .select("id, full_name")
        .eq("status", "active")
        .eq("job_title", "social_worker")
        .is("deleted_at", null)
        .order("full_name");
      if (!cancelled) {
        if (error) toast.error(`載入社工清單失敗：${error.message}`);
        else setWorkers((data ?? []) as WorkerOption[]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const result = await createVolunteer(form);
    setIsSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("學生帳號已建立");
    router.push(`/admin/volunteers/${result.volunteerId}`);
  };

  return (
    <>
      <PageHeader
        title="手動新增學生"
        description="適用於代為建立帳號的情境；建立後即為在職狀態，不經帳號審核流程。"
        backHref="/admin/volunteers"
        backLabel="學生名冊"
      />

      <div className="flex-1 p-4 sm:p-6">
        <form onSubmit={handleSubmit} className="max-w-3xl space-y-5">
          <Panel title="登入資訊">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="帳號" required hint="供登入使用，不可重複。">
                <input
                  className={inputClass}
                  value={form.username}
                  onChange={(e) => set("username", e.target.value)}
                  autoComplete="off"
                />
              </Field>
              <Field label="Email" required hint="僅作聯絡用途，可與其他人重複。">
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
              初始密碼將自動設為「帳號」，該學生首次登入時系統會強制要求變更密碼。
            </p>
          </Panel>

          <Panel title="基本資料">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="姓名" required>
                <input
                  className={inputClass}
                  value={form.fullName}
                  onChange={(e) => set("fullName", e.target.value)}
                />
              </Field>
              <Field label="電話" required>
                <input
                  className={inputClass}
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </Field>
              <Field label="生日" required>
                <input
                  type="date"
                  className={`${inputClass} date-input`}
                  value={form.birthDate}
                  onChange={(e) => set("birthDate", e.target.value)}
                />
              </Field>
              <Field label="學制" required>
                <Select
                  value={form.grade}
                  onValueChange={(v) => set("grade", v)}
                  options={Object.entries(GRADE_LEVEL_LABELS).map(([value, label]) => ({
                    value,
                    label,
                  }))}
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
              <Field label="負責社工" required hint="須為在職且職稱為社工的職員。">
                <Select
                  value={form.assignedWorkerId}
                  onValueChange={(v) => set("assignedWorkerId", v)}
                  placeholder={workers.length ? "請選擇社工" : "尚無在職社工"}
                  options={workers.map((w) => ({ value: w.id, label: w.full_name }))}
                />
              </Field>
            </div>
          </Panel>

          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" isLoading={isSaving}>
              建立學生帳號
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
