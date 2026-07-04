"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUp } from "@/lib/actions/auth";
import { Select } from "@/components/ui/select";
import {
  getBirthdayValidationError,
  normalizeBirthdayForSubmit,
  normalizeBirthdayInput,
} from "@/lib/birthday";
import { GRADE_LEVEL_LABELS } from "@/lib/types/database";
import type { GradeLevel, YilanRegion } from "@/lib/types/database";
import { setFlashToast, useToast } from "@/components/ui/toast";

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

  const [interests, setInterests] = useState({
    scholarships: false,
    volunteering: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.account.trim()) newErrors.account = "帳號為必填欄位";
    if (!formData.password) {
      newErrors.password = "密碼為必填欄位";
    } else if (formData.password.length < 8) {
      newErrors.password = "密碼長度至少需要 8 個字元";
    }
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "兩次輸入的密碼不一致";
    }
    if (!formData.name.trim()) newErrors.name = "姓名為必填欄位";
    if (!formData.phone.trim()) newErrors.phone = "電話為必填欄位";
    if (!formData.grade) newErrors.grade = "請選擇學制階段";

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email.trim()) {
      newErrors.email = "Email 為必填欄位";
    } else if (!emailRegex.test(formData.email)) {
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

  const handleBirthdayBlur = () => {
    setFormData((prev) => ({
      ...prev,
      birthday: normalizeBirthdayForSubmit(prev.birthday),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);

    const result = await signUp({
      account: formData.account,
      password: formData.password,
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      grade: formData.grade as GradeLevel,
      region: formData.region || undefined,
      birthday: normalizeBirthdayForSubmit(formData.birthday),
    });

    if (result.error) {
      toast.error(result.error);
      setIsLoading(false);
      return;
    }

    setFlashToast({
      variant: "success",
      title: "註冊成功",
      description: "帳號已建立，待管理員審核通過後即可報名志工活動。",
    });
    router.push("/login");
  };

  const requiredFields = ["account", "password", "confirmPassword", "name", "email", "phone", "grade", "birthday"];
  const optionalFields = ["region"];
  const allFields = [...requiredFields, ...optionalFields];
  const filledCount = allFields.filter(
    (k) => formData[k as keyof typeof formData].toString().trim() !== ""
  ).length;
  const progressPercent = Math.round((filledCount / allFields.length) * 100);

  function FieldError({ field }: { field: string }) {
    return errors[field] ? (
      <p className="text-red-500 text-xs mt-1">{errors[field]}</p>
    ) : null;
  }

  return (
    <main className="flex-1 flex flex-col items-center py-10 px-4">
      <div className="flex w-full max-w-160 flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-slate-900 text-4xl font-black tracking-tight">
            建立帳號
          </h1>
          <p className="text-slate-600 text-lg">
            掌握最新的服務機會與獎學金資訊。
          </p>
        </div>

        <div className="flex flex-col gap-3 bg-white p-6 rounded-xl shadow-sm border border-primary/5">
          <div className="flex justify-between items-center">
            <p className="text-slate-900 text-sm font-semibold uppercase tracking-wider">
              填寫進度
            </p>
            <p className="text-primary text-sm font-bold">{progressPercent}%</p>
          </div>
          <div className="w-full h-2 rounded-full bg-primary/10">
            <div
              className="h-2 rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <form
          className="flex flex-col gap-6 bg-white p-8 rounded-xl shadow-sm border border-primary/5"
          onSubmit={handleSubmit}
        >
          {/* 真實姓名 */}
          <div className="flex flex-col gap-2">
            <label className="text-slate-900 text-sm font-bold">真實姓名</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                person
              </span>
              <input
                className={`w-full pl-10 pr-4 py-3 rounded-lg border ${errors.name ? "border-red-400" : "border-slate-200"} bg-background-light focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all`}
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
            <label className="text-slate-900 text-sm font-bold">帳號</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                badge
              </span>
              <input
                className={`w-full pl-10 pr-4 py-3 rounded-lg border ${errors.account ? "border-red-400" : "border-slate-200"} bg-background-light focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all`}
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
            <label className="text-slate-900 text-sm font-bold">Email</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                mail
              </span>
              <input
                className={`w-full pl-10 pr-4 py-3 rounded-lg border ${errors.email ? "border-red-400" : "border-slate-200"} bg-background-light focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all`}
                name="email"
                placeholder="example@email.com"
                type="email"
                value={formData.email}
                onChange={handleChange}
              />
            </div>
            <FieldError field="email" />
          </div>

          {/* 生日 */}
          <div className="flex flex-col gap-2">
            <label className="text-slate-900 text-sm font-bold">生日</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                cake
              </span>
              <input
                className={`date-input w-full min-w-0 pl-10 pr-4 py-3 rounded-lg border ${errors.birthday ? "border-red-400" : "border-slate-200"} bg-background-light focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all`}
                name="birthday"
                type="text"
                inputMode="numeric"
                autoComplete="bday"
                maxLength={10}
                placeholder="YYYY-MM-DD"
                pattern="\d{4}-\d{2}-\d{2}"
                value={formData.birthday}
                onChange={handleChange}
                onBlur={handleBirthdayBlur}
              />
            </div>
            <FieldError field="birthday" />
          </div>

          {/* 電話 + 學制階段 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-slate-900 text-sm font-bold">電話</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  call
                </span>
                <input
                  className={`w-full pl-10 pr-4 py-3 rounded-lg border ${errors.phone ? "border-red-400" : "border-slate-200"} bg-background-light focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all`}
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
              <label className="text-slate-900 text-sm font-bold">學制階段</label>
              <div className="relative">
                <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400">
                  school
                </span>
                <Select
                  className="w-full"
                  triggerClassName={`w-full rounded-lg border ${errors.grade ? "border-red-400" : "border-slate-200"} bg-background-light py-3 pl-10 pr-4 text-slate-900 focus:border-transparent focus:ring-2 focus:ring-primary`}
                  menuClassName="bg-background-light"
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

          {/* 區域（非必填） */}
          <div className="flex flex-col gap-2">
            <label className="text-slate-900 text-sm font-bold">
              區域
              <span className="text-slate-400 font-normal ml-1">（選填）</span>
            </label>
            <div className="relative">
              <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400">
                location_on
              </span>
              <Select
                className="w-full"
                triggerClassName="w-full rounded-lg border border-slate-200 bg-background-light py-3 pl-10 pr-4 text-slate-900 focus:border-transparent focus:ring-2 focus:ring-primary"
                menuClassName="bg-background-light"
                name="region"
                value={formData.region}
                placeholder="請選擇區域"
                ariaLabel="區域"
                onValueChange={(value) => handleSelectChange("region", value)}
                options={REGIONS.map((region) => ({ value: region, label: region }))}
              />
            </div>
          </div>

          {/* 密碼 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-slate-900 text-sm font-bold">密碼</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  lock
                </span>
                <input
                  className={`w-full pl-10 pr-4 py-3 rounded-lg border ${errors.password ? "border-red-400" : "border-slate-200"} bg-background-light focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all`}
                  name="password"
                  placeholder="至少 8 碼"
                  type="password"
                  value={formData.password}
                  onChange={handleChange}
                />
              </div>
              <FieldError field="password" />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-slate-900 text-sm font-bold">
                確認密碼
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  lock_reset
                </span>
                <input
                  className={`w-full pl-10 pr-4 py-3 rounded-lg border ${errors.confirmPassword ? "border-red-400" : "border-slate-200"} bg-background-light focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all`}
                  name="confirmPassword"
                  placeholder="再輸入一次密碼"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                />
              </div>
              <FieldError field="confirmPassword" />
            </div>
          </div>

          {/* 興趣 */}
          <div className="flex flex-col gap-4 mt-2">
            <p className="text-slate-900 text-sm font-bold">您的感興趣項目</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 cursor-pointer hover:bg-primary/5 transition-colors">
                <input
                  className="w-5 h-5 rounded text-primary focus:ring-primary bg-background-light border-slate-300"
                  type="checkbox"
                  checked={interests.scholarships}
                  onChange={(e) =>
                    setInterests((p) => ({ ...p, scholarships: e.target.checked }))
                  }
                />
                <div className="flex flex-col">
                  <span className="font-bold text-slate-900">獎學金</span>
                  <span className="text-xs text-slate-500">接收獎學金申請通知</span>
                </div>
              </label>
              <label className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 cursor-pointer hover:bg-primary/5 transition-colors">
                <input
                  className="w-5 h-5 rounded text-primary focus:ring-primary bg-background-light border-slate-300"
                  type="checkbox"
                  checked={interests.volunteering}
                  onChange={(e) =>
                    setInterests((p) => ({ ...p, volunteering: e.target.checked }))
                  }
                />
                <div className="flex flex-col">
                  <span className="font-bold text-slate-900">志工服務</span>
                  <span className="text-xs text-slate-500">接收志工活動通知</span>
                </div>
              </label>
            </div>
          </div>

          {/* 送出 */}
          <div className="pt-4">
            <button
              className="w-full bg-primary text-white py-4 rounded-lg font-bold text-lg hover:bg-primary/90 transition-all shadow-md shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-60"
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="material-symbols-outlined animate-spin text-[20px]">
                  progress_activity
                </span>
              ) : (
                <>
                  <span>註冊成為志工</span>
                  <span className="material-symbols-outlined">arrow_forward</span>
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
