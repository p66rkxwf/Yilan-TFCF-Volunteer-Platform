"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody, CardFooter } from "@/components/ui/card";

export default function LoginPage() {
  const [formData, setFormData] = useState({
    account: "",
    password: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.account.trim()) newErrors.account = "請輸入帳號";
    if (!formData.password) newErrors.password = "請輸入密碼";
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      setIsLoading(true);
      // TODO: 串接登入 API 邏輯
      console.log("登入資料：", formData);

      // 模擬 API 請求延遲
      setTimeout(() => {
        setIsLoading(false);
        alert("登入成功！");
      }, 1000);
    }
  };

  return (
    <div className="min-h-[calc(100vh-80px)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-background">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground">歡迎回來</h1>
          <p className="mt-2 text-muted">
            還沒有帳號嗎？{" "}
            <Link href="/register" className="font-medium text-foreground underline underline-offset-2 hover:opacity-80 transition-opacity">
              立即註冊成為志工
            </Link>
          </p>
        </div>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <h2 className="text-xl font-bold text-center">志工登入</h2>
          </CardHeader>
          
          <form onSubmit={handleSubmit}>
            <CardBody className="content-spacing">
              <Input 
                label="帳號" name="account" type="text" placeholder="請輸入您的帳號" 
                value={formData.account} onChange={handleChange} error={errors.account}
              />
              
              <div>
                <Input 
                  label="密碼" name="password" type="password" placeholder="請輸入您的密碼" 
                  value={formData.password} onChange={handleChange} error={errors.password}
                />
                <div className="text-right mt-2">
                  <Link href="/forgot-password" className="text-sm text-foreground underline underline-offset-2 hover:opacity-80 transition-opacity">
                    忘記密碼？
                  </Link>
                </div>
              </div>
            </CardBody>

            <CardFooter>
              <Button type="submit" variant="primary" fullWidth size="lg" isLoading={isLoading}>
                登入
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}