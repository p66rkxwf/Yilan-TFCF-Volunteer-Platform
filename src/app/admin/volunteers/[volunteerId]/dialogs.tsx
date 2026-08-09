"use client";

// 學生詳情頁的四個對話框。每個各自持有自己的表單狀態，page.tsx 只負責開關與
// 送出後要做什麼——原本這些 useState 全攤在頁面元件上，一支元件要同時追 22 條
// 狀態。
//
// 這些元件不吃 open：關閉時由 page.tsx 直接不渲染。如此一來「開啟時要清空／
// 預填欄位」由掛載本身完成（useState 初始值），不需要 useEffect 去同步 open，
// 上一次填到一半的內容也不可能殘留到下一次開啟。
//
// 待辦：外框（遮罩＋卡片＋頁尾按鈕列）在此重複四次，而 components/ui/modal.tsx
// 的 Modal 已經提供同樣的東西，還多了 Escape 關閉、背景鎖捲、role="dialog" 與
// aria-modal。改用它會順帶補上這些無障礙行為，但也會多出關閉叉叉與標題分隔線，
// 屬外觀變更，故另案處理。

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, inputClass } from "@/components/admin/ui";
import { todayTaipeiDate } from "@/lib/admin/datetime";
import {
  isValidTaiwanPhone,
  isValidBirthDate,
  isValidEmail,
  isValidUsername,
} from "@/lib/validation";
import { YILAN_REGIONS } from "@/lib/types/database";
import type { VolunteerDetail } from "./panels";

// 四個對話框共用的外框。抽在本檔內是為了讓上面那則待辦只有一處要改。
function DialogShell({
  isBusy,
  onClose,
  children,
  footer,
  bodyClassName = "px-6 py-5",
  cardClassName = "relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl",
}: {
  isBusy: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  bodyClassName?: string;
  cardClassName?: string;
}) {
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center px-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40"
        onClick={() => !isBusy && onClose()}
        aria-label="關閉"
      />
      <div className={cardClassName}>
        <div className={bodyClassName}>{children}</div>
        <div className="flex shrink-0 items-center justify-end gap-2 rounded-b-2xl border-t border-slate-100 bg-slate-50/60 px-6 py-4">
          {footer}
        </div>
      </div>
    </div>
  );
}

function CancelButton({ isBusy, onClose }: { isBusy: boolean; onClose: () => void }) {
  return (
    <Button size="sm" variant="ghost" disabled={isBusy} onClick={onClose}>
      取消
    </Button>
  );
}

export function BlacklistDialog({
  isBusy,
  onClose,
  onSubmit,
}: {
  isBusy: boolean;
  onClose: () => void;
  onSubmit: (input: { days: string; note: string }) => void;
}) {
  const [days, setDays] = useState("");
  const [note, setNote] = useState("");

  return (
    <DialogShell
      isBusy={isBusy}
      onClose={onClose}
      footer={
        <>
          <CancelButton isBusy={isBusy} onClose={onClose} />
          <Button size="sm" isLoading={isBusy} onClick={() => onSubmit({ days, note })}>
            確定加入
          </Button>
        </>
      }
    >
      <h3 className="text-lg font-bold text-slate-900">手動加入黑名單</h3>
      <p className="mt-1 text-sm text-slate-500">
        將立即列入黑名單並連動取消該學生所有尚未開始的報名，並通知學生。
      </p>
      <div className="mt-4 space-y-4">
        <Field label="黑名單天數" hint="留空＝使用系統預設自動解除天數。">
          <input
            type="number"
            min={1}
            className={inputClass}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            placeholder="系統預設"
          />
        </Field>
        <Field label="備註" hint="供申訴核對，選填。">
          <textarea
            className={`${inputClass} min-h-20`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>
    </DialogShell>
  );
}

export interface EditProfileInput {
  fullName: string;
  phone: string;
  region: string;
  birthDate: string;
  email: string;
  username: string;
}

export function EditProfileDialog({
  isBusy,
  volunteer,
  isSysAdmin,
  onClose,
  onSubmit,
}: {
  isBusy: boolean;
  volunteer: VolunteerDetail;
  isSysAdmin: boolean;
  onClose: () => void;
  onSubmit: (form: EditProfileInput) => void;
}) {
  // 掛載時以目前資料預填；關閉再開會重新掛載，因此看到的一定是最新值。
  const [form, setForm] = useState<EditProfileInput>(() => ({
    fullName: volunteer.full_name,
    phone: volunteer.phone,
    region: volunteer.region ?? "",
    birthDate: volunteer.birth_date,
    email: volunteer.email,
    username: volunteer.username,
  }));
  const [errors, setErrors] = useState<Partial<Record<keyof EditProfileInput, string>>>({});

  const set = (key: keyof EditProfileInput, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = () => {
    const next: Partial<Record<keyof EditProfileInput, string>> = {};
    if (!form.fullName.trim()) next.fullName = "請輸入姓名";
    if (!form.phone.trim()) next.phone = "請輸入電話";
    else if (!isValidTaiwanPhone(form.phone)) next.phone = "電話格式不正確（例：0912345678）";
    if (!form.birthDate) next.birthDate = "請選擇生日";
    else if (!isValidBirthDate(form.birthDate)) next.birthDate = "生日不可為未來日期";
    if (isSysAdmin) {
      if (!isValidEmail(form.email)) next.email = "Email 格式不正確";
      if (!isValidUsername(form.username))
        next.username = "帳號格式不正確（4～30 碼英數與 . _ -）";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onSubmit(form);
  };

  return (
    <DialogShell
      isBusy={isBusy}
      onClose={onClose}
      // 內容較高（系統管理員多兩欄），限制在視窗高度內、表單區自行捲動
      cardClassName="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col rounded-2xl border border-slate-200 bg-white shadow-xl"
      bodyClassName="overflow-y-auto px-6 py-5"
      footer={
        <>
          <CancelButton isBusy={isBusy} onClose={onClose} />
          <Button size="sm" isLoading={isBusy} onClick={handleSubmit}>
            儲存
          </Button>
        </>
      }
    >
      <h3 className="text-lg font-bold text-slate-900">編輯基本資料</h3>
      <p className="mt-1 text-sm text-slate-500">
        姓名已鎖定學生自助修改，改由此處維護。學制調整請至「年度審查」。
        {isSysAdmin && "聯絡 Email 與帳號僅系統管理員可代改。"}
      </p>
      <div className="mt-4 space-y-4">
        <Field label="姓名" required error={errors.fullName}>
          <input
            className={inputClass}
            value={form.fullName}
            onChange={(e) => set("fullName", e.target.value)}
          />
        </Field>
        <Field label="電話" required error={errors.phone}>
          <input
            className={inputClass}
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
        </Field>
        <Field label="生日" error={errors.birthDate}>
          <DatePicker
            value={form.birthDate}
            onChange={(v) => set("birthDate", v)}
            invalid={!!errors.birthDate}
            max={todayTaipeiDate()}
          />
        </Field>
        <Field label="地區">
          <Select
            value={form.region}
            onValueChange={(v) => set("region", v)}
            placeholder="請選擇地區"
            options={YILAN_REGIONS.map((r) => ({ value: r, label: r }))}
            menuClassName="bg-white"
          />
        </Field>
        {isSysAdmin && (
          <>
            <Field
              label="聯絡 Email"
              required
              error={errors.email}
              hint="代改後會重置驗證狀態，該學生需重新驗證才能報名／簽到"
            >
              <input
                type="email"
                className={inputClass}
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </Field>
            <Field
              label="帳號"
              required
              error={errors.username}
              hint="該學生以此帳號登入，變更後即刻生效（密碼不變）"
            >
              <input
                className={inputClass}
                value={form.username}
                onChange={(e) => set("username", e.target.value)}
              />
            </Field>
          </>
        )}
      </div>
    </DialogShell>
  );
}

export function ReassignDialog({
  isBusy,
  volunteer,
  workers,
  onClose,
  onSubmit,
}: {
  isBusy: boolean;
  volunteer: VolunteerDetail;
  workers: { id: string; full_name: string }[];
  onClose: () => void;
  onSubmit: (workerId: string) => void;
}) {
  // 預選目前的負責社工，讓「沒有變更」一眼可見（送出鈕也據此停用）。
  const [workerId, setWorkerId] = useState(volunteer.assigned_worker_id ?? "");

  return (
    <DialogShell
      isBusy={isBusy}
      onClose={onClose}
      footer={
        <>
          <CancelButton isBusy={isBusy} onClose={onClose} />
          <Button
            size="sm"
            isLoading={isBusy}
            disabled={!workerId || workerId === volunteer.assigned_worker_id}
            onClick={() => onSubmit(workerId)}
          >
            確定變更
          </Button>
        </>
      }
    >
      <h3 className="text-lg font-bold text-slate-900">變更負責社工</h3>
      <p className="mt-1 text-sm text-slate-500">
        為 {volunteer.full_name} 指定新的負責社工。目前：
        {volunteer.worker?.full_name ?? "未指派"}。
      </p>
      <div className="mt-4">
        <Field label="負責社工" hint="僅列出在職社工。">
          <Select
            value={workerId}
            onValueChange={setWorkerId}
            placeholder={workers.length ? "選擇社工" : "無在職社工"}
            options={workers.map((w) => ({ value: w.id, label: w.full_name }))}
            menuClassName="bg-white"
          />
        </Field>
      </div>
    </DialogShell>
  );
}

export function ResetPasswordDialog({
  isBusy,
  volunteer,
  onClose,
  onConfirm,
}: {
  isBusy: boolean;
  volunteer: VolunteerDetail;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <DialogShell
      isBusy={isBusy}
      onClose={onClose}
      footer={
        <>
          <CancelButton isBusy={isBusy} onClose={onClose} />
          <Button size="sm" isLoading={isBusy} onClick={onConfirm}>
            確定重置
          </Button>
        </>
      }
    >
      <h3 className="text-lg font-bold text-slate-900">重置密碼</h3>
      <p className="mt-1 text-sm text-slate-500">
        系統會為 {volunteer.full_name}（帳號{" "}
        <span className="font-semibold text-slate-700">{volunteer.username}</span>
        ）產生一組臨時密碼並顯示於畫面上（僅顯示一次），請轉告該學生；
        系統不會另外寄出通知。該學生首次登入時會被強制要求設定新密碼。
      </p>
    </DialogShell>
  );
}
