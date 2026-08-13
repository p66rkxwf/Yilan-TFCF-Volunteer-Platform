"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUp } from "@/lib/actions/auth";
import { callAction } from "@/lib/ui/toast-actions";
import { createClient } from "@/lib/supabase/client";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { todayTaipeiDate } from "@/lib/admin/datetime";
import {
  getBirthdayValidationError,
  normalizeBirthdayForSubmit,
  normalizeBirthdayInput,
} from "@/lib/birthday";
import { GRADE_LEVEL_LABELS } from "@/lib/types/database";
import { isValidEmail, isValidTaiwanPhone, isValidUsername } from "@/lib/validation";
import type { GradeLevel, YilanRegion } from "@/lib/types/database";
import { setFlashToast, useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import {
  TurnstileWidget,
  type TurnstileHandle,
} from "@/components/support/turnstile-widget";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

const REGIONS: YilanRegion[] = [
  "宜蘭市", "羅東鎮", "蘇澳鎮", "頭城鎮", "礁溪鄉",
  "壯圍鄉", "員山鄉", "冬山鄉", "五結鄉", "三星鄉", "大同鄉", "南澳鄉",
];

const GRADE_LEVELS: GradeLevel[] = [
  "junior_high", "senior_high", "university", "graduate_school", "doctorate",
];

export default function RegisterPage() {
  const router = useRouter();
  const toast = useToast();
  const supabase = createClient();

  const [formData, setFormData] = useState({
    account: "",
    password: "",
    confirmPassword: "",
    name: "",
    email: "",
    phone: "",
    grade: "" as GradeLevel | "",
    region: "" as YilanRegion | "",
    birthday: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.account.trim()) {
      newErrors.account = "帳號為必填欄位";
    } else if (!isValidUsername(formData.account)) {
      newErrors.account = "帳號需為 4～30 碼英數字或 . _ -";
    }
    if (!formData.password) {
      newErrors.password = "密碼為必填欄位";
    } else if (formData.password.length < 8) {
      newErrors.password = "密碼長度至少需要 8 個字元";
    }
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "兩次輸入的密碼不一致";
    }
    if (!formData.name.trim()) newErrors.name = "姓名為必填欄位";
    if (!formData.phone.trim()) {
      newErrors.phone = "電話為必填欄位";
    } else if (!isValidTaiwanPhone(formData.phone)) {
      newErrors.phone = "電話格式不正確（例：0912345678）";
    }
    if (!formData.grade) newErrors.grade = "請選擇學制階段";
    if (!formData.region) newErrors.region = "請選擇區域";

    if (!formData.email.trim()) {
      newErrors.email = "Email 為必填欄位";
    } else if (!isValidEmail(formData.email)) {
      newErrors.email = "請輸入有效的 Email 格式";
    }

    const birthdayError = getBirthdayValidationError(formData.birthday, {
      required: true,
    });
    if (birthdayError) newErrors.birthday = birthdayError;

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = e.target;
    const nextValue =
      name === "birthday" ? normalizeBirthdayInput(value) : value;

    setFormData((prev) => ({ ...prev, [name]: nextValue }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleSelectChange = (name: "region" | "grade", value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      toast.error("請先完成人機驗證後再送出。", "驗證未完成");
      return;
    }

    setIsLoading(true);

    const result = await callAction(() => signUp({
      account: formData.account,
      password: formData.password,
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      grade: formData.grade as GradeLevel,
      region: formData.region || undefined,
      birthday: normalizeBirthdayForSubmit(formData.birthday),
      turnstileToken,
    }));

    if (result.error) {
      // token 已被伺服器端 siteverify 消耗（一次性），失敗重試前需重置取得新 token。
      turnstileRef.current?.reset();
      toast.error(result.error);
      setIsLoading(false);
      return;
    }

    if (!result.session) {
      // 保險路徑：日後若 Supabase 開啟 Email 驗證，signUp 不會回 session，
      // 此時沒有登入狀態，導回登入頁自行登入。
      router.push("/login?registered=true");
      return;
    }

    // signUp 已在伺服器端種下 session cookie，但瀏覽器端的 supabase client 是模組單例、
    // 不會自己察覺；比照登入頁呼叫 setSession() 觸發 onAuthStateChange，導覽列才會立刻
    // 由「登入」變成「登出」，不用整頁重新整理。
    const { error: setSessionError } = await supabase.auth.setSession(result.session);
    if (setSessionError) {
      // 伺服器端 cookie 已經寫進去了，導向 /login 只會被 middleware 反彈回首頁；
      // 改用整頁導向——重新載入會重建瀏覽器端 client 並讀到 cookie，狀態必定正確。
      window.location.assign("/account-review");
      return;
    }

    setFlashToast({
      variant: "success",
      title: "註冊成功",
      description: "帳號已建立，待管理員審核通過後即可報名志工活動。",
    });
    // 不可導向 /login：已登入者會被 middleware 反彈回首頁。待審核志工的去處是審核說明頁。
    router.push("/account-review");
    router.refresh();
  };

  function FieldError({ field }: { field: string }) {
    return errors[field] ? (
      <p className="text-amber-600 text-xs mt-1">{errors[field]}</p>
    ) : null;
  }

  return (
    <main className="flex-1 flex flex-col items-center py-10 px-4">
      <div className="flex w-full max-w-160 flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-slate-900 text-4xl font-black tracking-tight">
            建立帳號
          </h1>
        </div>

        <form
          className="flex flex-col gap-6 bg-white p-8 rounded-xl shadow-sm border border-primary/5"
          onSubmit={handleSubmit}
        >
          {/* 真實姓名 */}
          <div className="flex flex-col gap-2">
            <label htmlFor="reg-name" className="text-slate-900 text-sm font-bold">真實姓名</label>
            <div className="relative">
              <span translate="no" aria-hidden="true" className="material-symbols-outlined notranslate absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                person
              </span>
              <input
                className={`w-full pl-10 pr-4 py-3 rounded-lg border ${errors.name ? "border-amber-400" : "border-slate-200"} bg-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all`}
                id="reg-name"
                name="name"
                placeholder="請輸入您的姓名"
                type="text"
                value={formData.name}
                onChange={handleChange}
              />
            </div>
            <FieldError field="name" />
          </div>

          {/* 帳號 */}
          <div className="flex flex-col gap-2">
            <label htmlFor="reg-account" className="text-slate-900 text-sm font-bold">帳號</label>
            <div className="relative">
              <span translate="no" aria-hidden="true" className="material-symbols-outlined notranslate absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                badge
              </span>
              <input
                className={`w-full pl-10 pr-4 py-3 rounded-lg border ${errors.account ? "border-amber-400" : "border-slate-200"} bg-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all`}
                id="reg-account"
                name="account"
                placeholder="請設定您的帳號"
                type="text"
                value={formData.account}
                onChange={handleChange}
              />
            </div>
            <FieldError field="account" />
          </div>

          {/* Email */}
          <div className="flex flex-col gap-2">
            <label htmlFor="reg-email" className="text-slate-900 text-sm font-bold">Email</label>
            <div className="relative">
              <span translate="no" aria-hidden="true" className="material-symbols-outlined notranslate absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                mail
              </span>
              <input
                className={`w-full pl-10 pr-4 py-3 rounded-lg border ${errors.email ? "border-amber-400" : "border-slate-200"} bg-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all`}
                id="reg-email"
                name="email"
                placeholder="請輸入 Email"
                type="email"
                value={formData.email}
                onChange={handleChange}
              />
            </div>
            <FieldError field="email" />
          </div>

          {/* 生日 */}
          <div className="flex flex-col gap-2">
            <label htmlFor="reg-birthday" className="text-slate-900 text-sm font-bold">生日</label>
            <div className="relative">
              <span translate="no" aria-hidden="true" className="material-symbols-outlined notranslate absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400">
                cake
              </span>
              <DatePicker
                id="reg-birthday"
                value={formData.birthday}
                onChange={(v) => {
                  setFormData((prev) => ({ ...prev, birthday: normalizeBirthdayInput(v) }));
                  if (errors.birthday) setErrors((prev) => ({ ...prev, birthday: "" }));
                }}
                invalid={!!errors.birthday}
                max={todayTaipeiDate()}
                aria-label="生日"
                inputClassName={`w-full min-w-0 pl-10 pr-10 py-3 rounded-lg border ${errors.birthday ? "border-amber-400" : "border-slate-200"} bg-white text-sm text-slate-900 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all`}
              />
            </div>
            <FieldError field="birthday" />
          </div>

          {/* 電話 + 學制階段 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="reg-phone" className="text-slate-900 text-sm font-bold">電話</label>
              <div className="relative">
                <span translate="no" aria-hidden="true" className="material-symbols-outlined notranslate absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  call
                </span>
                <input
                  className={`w-full pl-10 pr-4 py-3 rounded-lg border ${errors.phone ? "border-amber-400" : "border-slate-200"} bg-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all`}
                  id="reg-phone"
                  name="phone"
                  placeholder="請輸入聯絡電話"
                  type="tel"
                  value={formData.phone}
                  onChange={handleChange}
                />
              </div>
              <FieldError field="phone" />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-slate-900 text-sm font-bold">學制階段</span>
              <div className="relative">
                <span translate="no" aria-hidden="true" className="material-symbols-outlined notranslate pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400">
                  school
                </span>
                <Select
                  className="w-full"
                  triggerClassName={`w-full rounded-lg border ${errors.grade ? "border-amber-400" : "border-slate-200"} bg-white py-3 pl-10 pr-4 text-slate-900 focus:border-transparent focus:ring-2 focus:ring-primary`}
                  menuClassName="bg-white"
                  name="grade"
                  value={formData.grade}
                  placeholder="請選擇學制階段"
                  ariaLabel="學制階段"
                  onValueChange={(value) => handleSelectChange("grade", value)}
                  options={GRADE_LEVELS.map((grade) => ({
                    value: grade,
                    label: GRADE_LEVEL_LABELS[grade],
                  }))}
                />
              </div>
              <FieldError field="grade" />
            </div>
          </div>

          {/* 區域 */}
          <div className="flex flex-col gap-2">
            <span className="text-slate-900 text-sm font-bold">區域</span>
            <div className="relative">
              <span translate="no" aria-hidden="true" className="material-symbols-outlined notranslate pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400">
                location_on
              </span>
              <Select
                className="w-full"
                triggerClassName={`w-full rounded-lg border ${errors.region ? "border-amber-400" : "border-slate-200"} bg-white py-3 pl-10 pr-4 text-slate-900 focus:border-transparent focus:ring-2 focus:ring-primary`}
                menuClassName="bg-white"
                name="region"
                value={formData.region}
                placeholder="請選擇區域"
                ariaLabel="區域"
                onValueChange={(value) => handleSelectChange("region", value)}
                options={REGIONS.map((region) => ({ value: region, label: region }))}
              />
            </div>
            <FieldError field="region" />
          </div>

          {/* 密碼 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="reg-password" className="text-slate-900 text-sm font-bold">密碼</label>
              <div className="relative">
                <span translate="no" aria-hidden="true" className="material-symbols-outlined notranslate absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  lock
                </span>
                <input
                  className={`w-full pl-10 pr-4 py-3 rounded-lg border ${errors.password ? "border-amber-400" : "border-slate-200"} bg-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all`}
                  id="reg-password"
                  name="password"
                  placeholder="至少 8 碼"
                  type="password"
                  autoComplete="new-password"
                  value={formData.password}
                  onChange={handleChange}
                />
              </div>
              <FieldError field="password" />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="reg-confirmPassword" className="text-slate-900 text-sm font-bold">
                確認密碼
              </label>
              <div className="relative">
                <span translate="no" aria-hidden="true" className="material-symbols-outlined notranslate absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  lock_reset
                </span>
                <input
                  className={`w-full pl-10 pr-4 py-3 rounded-lg border ${errors.confirmPassword ? "border-amber-400" : "border-slate-200"} bg-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all`}
                  id="reg-confirmPassword"
                  name="confirmPassword"
                  placeholder="再輸入一次密碼"
                  type="password"
                  autoComplete="new-password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                />
              </div>
              <FieldError field="confirmPassword" />
            </div>
          </div>

          {TURNSTILE_SITE_KEY && (
            <TurnstileWidget
              ref={turnstileRef}
              siteKey={TURNSTILE_SITE_KEY}
              onToken={setTurnstileToken}
            />
          )}

          {/* 送出 */}
          <div className="pt-4">
            <button
              className="w-full bg-primary text-white py-4 rounded-lg font-bold text-lg hover:bg-primary/90 transition-all shadow-md shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-60"
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? (
                <Spinner className="text-[20px]" />
              ) : (
                <>
                  <span>註冊成為志工</span>
                  <span translate="no" aria-hidden="true" className="material-symbols-outlined notranslate">arrow_forward</span>
                </>
              )}
            </button>
            <p className="text-center mt-6 text-sm text-slate-500">
              註冊即代表您同意我們的{" "}
              <Link href="/terms" className="text-primary underline">
                服務條款
              </Link>
              {" "}和{" "}
              <Link href="/privacy" className="text-primary underline">
                隱私政策
              </Link>
              。
            </p>
          </div>
        </form>

        <div className="flex justify-center gap-8 text-sm text-slate-500 pb-10">
          <p>
            已經有帳號了嗎？{" "}
            <Link href="/login" className="text-primary font-bold hover:underline">
              立即登入
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
