"use client";

import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody, CardFooter } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-[calc(100vh-80px)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-background">
      <div className="max-w-md w-full">
        {/* 標題區塊 */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground">重設密碼</h1>
          <p className="mt-2 text-muted">
            請輸入您註冊時使用的電子郵件，我們將發送重設密碼的連結給您。
          </p>
        </div>

        {/* 忘記密碼表單卡片 */}
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <h2 className="text-xl font-bold text-center">發送重設連結</h2>
          </CardHeader>
          
          <CardBody className="content-spacing">
            <Input 
              label="電子郵件" 
              type="email" 
              placeholder="example@email.com" 
              inputSize="md"
            />
          </CardBody>

          <CardFooter className="flex flex-col gap-4">
            <Button variant="primary" fullWidth size="lg">
              發送重設信件
            </Button>
            
            <Link href="/login" className="w-full">
              <Button variant="ghost" fullWidth className="text-muted hover:text-foreground">
                <ArrowLeft className="w-4 h-4 mr-2" />
                返回登入頁面
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}