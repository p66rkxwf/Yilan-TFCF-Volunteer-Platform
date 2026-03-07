"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody, CardFooter } from "@/components/ui/card";

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    account: "",
    password: "",
    name: "",
    email: "",
    region: "",
    socialWorker: "",
    birthday: "",
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
    if (!formData.name.trim()) newErrors.name = "姓名為必填欄位";
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email.trim()) {
      newErrors.email = "Email為必填欄位";
    } else if (!emailRegex.test(formData.email)) {
      newErrors.email = "請輸入有效的 Email 格式";
    }

    if (!formData.region.trim()) newErrors.region = "區域為必填欄位";
    if (!formData.socialWorker.trim()) newErrors.socialWorker = "負責社工為必填欄位";
    if (!formData.birthday) newErrors.birthday = "生日為必填欄位";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // 清除該欄位的錯誤提示
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      setIsLoading(true);
      // TODO: 串接註冊 API 邏輯
      console.log("註冊資料：", formData);
      
      // 模擬 API 請求延遲
      setTimeout(() => {
        setIsLoading(false);
        alert("註冊成功！");
      }, 1000);
    }
  };

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
          
          <form onSubmit={handleSubmit}>
            <CardBody className="content-spacing">
              <Input 
                label="帳號" name="account" type="text" placeholder="請設定您的帳號"
                value={formData.account} onChange={handleChange} error={errors.account}
              />
              <Input 
                label="密碼" name="password" type="password" placeholder="請輸入至少 8 碼的密碼"
                value={formData.password} onChange={handleChange} error={errors.password}
              />
              <Input 
                label="真實姓名" name="name" type="text" placeholder="請輸入您的姓名"
                value={formData.name} onChange={handleChange} error={errors.name}
              />
              <Input 
                label="生日" name="birthday" type="date"
                value={formData.birthday} onChange={handleChange} error={errors.birthday}
              />
              <Input 
                label="Email" name="email" type="email" placeholder="example@email.com"
                value={formData.email} onChange={handleChange} error={errors.email}
              />
              <Input 
                label="區域" name="region" type="text" placeholder="請輸入您所在的區域 (如：宜蘭市)"
                value={formData.region} onChange={handleChange} error={errors.region}
              />
              <Input 
                label="負責社工" name="socialWorker" type="text" placeholder="請輸入負責社工姓名"
                value={formData.socialWorker} onChange={handleChange} error={errors.socialWorker}
              />
            </CardBody>

            <CardFooter>
              <Button type="submit" variant="primary" fullWidth size="lg" isLoading={isLoading}>
                註冊成為志工
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}