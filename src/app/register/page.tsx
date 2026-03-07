"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody, CardFooter } from "@/components/ui/card";
import { register, getSocialWorkers } from "@/app/actions/auth";

const MySwal = withReactContent(Swal);

// 定義宜蘭區域 ENUM 選項
const YILAN_REGIONS = [
  "宜蘭市", "羅東鎮", "蘇澳鎮", "頭城鎮", "礁溪鄉", 
  "壯圍鄉", "員山鄉", "冬山鄉", "五結鄉", "三星鄉", 
  "大同鄉", "南澳鄉"
] as const;

// 建立 Zod 驗證 Schema
const registerSchema = z.object({
  account: z.string().min(1, "帳號為必填欄位"),
  password: z.string().min(8, "密碼長度至少需要 8 個字元"),
  name: z.string().min(1, "姓名為必填欄位"),
  email: z.string().email("請輸入有效的 Email 格式"),
  region: z.enum(YILAN_REGIONS).optional().or(z.literal("")), 
  socialWorkerId: z.string().optional().or(z.literal("")),
  birthday: z.string().min(1, "生日為必填欄位"),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

interface SocialWorker {
  id: string;
  full_name: string;
}

export default function RegisterPage() {
  const [isPending, startTransition] = useTransition();
  const [socialWorkers, setSocialWorkers] = useState<SocialWorker[]>([]);
  const [isFetchingWorkers, setIsFetchingWorkers] = useState(true);

  const {
    register: formRegister,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      account: "",
      password: "",
      name: "",
      email: "",
      region: undefined,
      socialWorkerId: "",
      birthday: "",
    },
  });

  // 取得社工名單
  useEffect(() => {
    const fetchWorkers = async () => {
      try {
        const workers = await getSocialWorkers();
        setSocialWorkers(workers);
      } catch (error) {
        console.error("載入社工名單失敗:", error);
      } finally {
        setIsFetchingWorkers(false);
      }
    };
    fetchWorkers();
  }, []);

  const onSubmit = (data: RegisterFormValues) => {
    startTransition(async () => {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        formData.append(key, value);
      });

      // 呼叫 Server Action
      const result = await register(formData);

      // 若 Server Action 回傳 error，顯示錯誤提示；
      // 若成功，Server Action 內部的 redirect 會直接接管畫面跳轉
      if (result?.error) {
        MySwal.fire({
          icon: "error",
          title: "註冊失敗",
          text: result.error,
          confirmButtonColor: "var(--foreground)",
        });
      }
    });
  };

  const selectBaseClasses = "w-full border rounded-lg bg-surface text-foreground transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-zinc-300 focus:ring-offset-1 focus:ring-offset-background px-4 py-2.5 text-base dark:bg-surface dark:text-foreground dark:focus:ring-zinc-600";

  return (
    <div className="min-h-[calc(100vh-80px)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-background">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground">加入志工行列</h1>
          <p className="mt-2 text-muted">
            已經有帳號了嗎？{" "}
            <Link href="/login" className="font-medium text-foreground underline underline-offset-2 hover:opacity-80 transition-opacity">
              立即登入
            </Link>
          </p>
        </div>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <h2 className="text-xl font-bold text-center">填寫註冊資料</h2>
          </CardHeader>
          
          <form onSubmit={handleSubmit(onSubmit)}>
            <CardBody className="content-spacing">
              <Input 
                label="帳號" type="text" placeholder="請設定您的帳號"
                {...formRegister("account")} error={errors.account?.message}
              />
              <Input 
                label="密碼" type="password" placeholder="請輸入至少 8 碼的密碼"
                {...formRegister("password")} error={errors.password?.message}
              />
              <Input 
                label="真實姓名" type="text" placeholder="請輸入您的姓名"
                {...formRegister("name")} error={errors.name?.message}
              />
              <Input 
                label="生日" type="date"
                {...formRegister("birthday")} error={errors.birthday?.message}
              />
              <Input 
                label="Email" type="email" placeholder="example@email.com"
                {...formRegister("email")} error={errors.email?.message}
              />
              
              <div className="w-full">
                <label className="block text-sm font-medium text-foreground mb-2">區域</label>
                <select
                  {...formRegister("region")}
                  className={`${selectBaseClasses} ${errors.region ? "border-red-500 focus:ring-red-500" : "border-border"}`}
                >
                  <option value="">請選擇區域</option>
                  {YILAN_REGIONS.map((region) => (
                    <option key={region} value={region}>{region}</option>
                  ))}
                </select>
                {errors.region && <p className="mt-1.5 text-sm font-medium text-red-600">{errors.region.message}</p>}
              </div>

              <div className="w-full">
                <label className="block text-sm font-medium text-foreground mb-2">負責社工</label>
                <select
                  {...formRegister("socialWorkerId")}
                  disabled={isFetchingWorkers}
                  className={`${selectBaseClasses} ${errors.socialWorkerId ? "border-red-500 focus:ring-red-500" : "border-border"} disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <option value="">
                    {isFetchingWorkers ? "載入社工名單中..." : "請選擇負責社工"}
                  </option>
                  {socialWorkers.map((worker) => (
                    <option key={worker.id} value={worker.id}>
                      {worker.full_name}
                    </option>
                  ))}
                </select>
                {errors.socialWorkerId && <p className="mt-1.5 text-sm font-medium text-red-600">{errors.socialWorkerId.message}</p>}
              </div>
            </CardBody>

            <CardFooter>
              <Button type="submit" variant="primary" fullWidth size="lg" isLoading={isPending}>
                註冊成為志工
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}