'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import Swal from 'sweetalert2'
import withReactContent from 'sweetalert2-react-content'
import { login } from '@/app/actions/auth'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

const MySwal = withReactContent(Swal)

const loginSchema = z.object({
  email: z.string().email('請輸入有效的 Email 格式'),
  password: z.string().min(1, '請輸入密碼'),
})

type LoginFormValues = z.infer<typeof loginSchema>

export default function LoginPage() {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema)
  })

  const onSubmit = async (data: LoginFormValues) => {
    setIsSubmitting(true)
    const formData = new FormData()
    formData.append('email', data.email)
    formData.append('password', data.password)

    const result = await login(formData)

    setIsSubmitting(false)

    if (result?.error) {
      MySwal.fire({ icon: 'error', title: '登入失敗', text: result.error })
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center py-12 sm:px-6 lg:px-8 bg-gray-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          志工平台登入
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          歡迎回來！請輸入您的帳號與密碼
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl border border-gray-100 sm:rounded-xl sm:px-10">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                電子郵件 (帳號)
              </label>
              <Input 
                type="email" 
                placeholder="example@mail.com" 
                className="border-gray-300 shadow-sm"
                {...register('email')} 
              />
              {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                密碼
              </label>
              <Input 
                type="password" 
                placeholder="請輸入密碼" 
                className="border-gray-300 shadow-sm"
                {...register('password')} 
              />
              {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>}
            </div>

            <div className="flex items-center justify-end">
              <div className="text-sm">
                <Link href="/forgot-password" className="font-medium text-blue-600 hover:text-blue-500">
                  忘記密碼？
                </Link>
              </div>
            </div>

            <div>
              <Button type="submit" className="w-full text-base py-5" disabled={isSubmitting}>
                {isSubmitting ? '登入驗證中...' : '登入'}
              </Button>
            </div>

            <div className="mt-6 text-center text-sm text-gray-600">
              還沒有帳號嗎？{' '}
              <Link href="/register" className="font-medium text-blue-600 hover:underline">
                立即註冊
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}