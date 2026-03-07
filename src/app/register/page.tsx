'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import Swal from 'sweetalert2'
import withReactContent from 'sweetalert2-react-content'
import { getSocialWorkers } from '@/app/actions/workers'
import { register } from '@/app/actions/auth'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const MySwal = withReactContent(Swal)

// 宜蘭區域選項
const REGION_OPTIONS = [
  { value: '宜蘭市', label: '宜蘭市' }, { value: '羅東鎮', label: '羅東鎮' },
  { value: '蘇澳鎮', label: '蘇澳鎮' }, { value: '頭城鎮', label: '頭城鎮' },
  { value: '礁溪鄉', label: '礁溪鄉' }, { value: '壯圍鄉', label: '壯圍鄉' },
  { value: '員山鄉', label: '員山鄉' }, { value: '冬山鄉', label: '冬山鄉' },
  { value: '五結鄉', label: '五結鄉' }, { value: '三星鄉', label: '三星鄉' },
  { value: '大同鄉', label: '大同鄉' }, { value: '南澳鄉', label: '南澳鄉' }
]

const registerSchema = z.object({
  email: z.string().email('請輸入有效的 Email 格式'),
  password: z.string().min(8, '密碼長度至少需 8 個字元'),
  name: z.string().min(1, '請輸入姓名').max(10, '姓名不可超過 10 個字元'),
  birthday: z.string().min(1, '請選擇生日'),
  region: z.string().optional(),
  socialWorkerId: z.string().optional(),
})

type RegisterFormValues = z.infer<typeof registerSchema>

export default function RegisterPage() {
  const router = useRouter()
  const [workers, setWorkers] = useState<{ id: string; full_name: string }[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { register: formRegister, handleSubmit, formState: { errors } } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      region: '',
      socialWorkerId: '',
    }
  })

  useEffect(() => {
    const fetchWorkers = async () => {
      const data = await getSocialWorkers()
      setWorkers(data)
    }
    fetchWorkers()
  }, [])

  const onSubmit = async (data: RegisterFormValues) => {
    setIsSubmitting(true)
    const formData = new FormData()
    formData.append('email', data.email)
    formData.append('password', data.password)
    formData.append('name', data.name)
    formData.append('birthday', data.birthday)
    if (data.region) formData.append('region', data.region)
    if (data.socialWorkerId) formData.append('socialWorkerId', data.socialWorkerId)

    const result = await register(formData)

    setIsSubmitting(false)

    if (result?.error) {
      MySwal.fire({ icon: 'error', title: '註冊失敗', text: result.error })
    } else {
      MySwal.fire({
        icon: 'success',
        title: '註冊成功',
        text: '您的帳號已建立，請登入。',
        confirmButtonText: '前往登入'
      }).then(() => {
        router.push('/login')
      })
    }
  }

  const workerOptions = workers.map(w => ({ value: w.id, label: w.full_name }))

  return (
    <div className="flex min-h-screen flex-col justify-center py-12 sm:px-6 lg:px-8 bg-gray-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          建立志工帳號
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          請填寫以下真實資訊，完成您的專屬帳號註冊
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl border border-gray-100 sm:rounded-xl sm:px-10">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                電子郵件 (帳號) <span className="text-red-500">*</span>
              </label>
              <Input 
                type="email" 
                placeholder="example@mail.com" 
                className="border-gray-300 shadow-sm"
                {...formRegister('email')} 
              />
              {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                密碼 <span className="text-red-500">*</span>
              </label>
              <Input 
                type="password" 
                placeholder="至少 8 位數密碼" 
                className="border-gray-300 shadow-sm"
                {...formRegister('password')} 
              />
              {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                真實姓名 <span className="text-red-500">*</span>
              </label>
              <Input 
                type="text" 
                placeholder="請輸入您的姓名" 
                className="border-gray-300 shadow-sm"
                {...formRegister('name')} 
              />
              {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                生日 <span className="text-red-500">*</span>
              </label>
              <Input 
                type="date" 
                className="border-gray-300 shadow-sm"
                {...formRegister('birthday')} 
              />
              {errors.birthday && <p className="text-red-500 text-sm mt-1">{errors.birthday.message}</p>}
            </div>

            <div className="relative pt-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-2 text-gray-400">選填項目</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                所在區域
              </label>
              <Select 
                options={REGION_OPTIONS} 
                placeholder="請選擇您所在的鄉鎮市" 
                className="border-gray-300 shadow-sm"
                {...formRegister('region')} 
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                負責社工
              </label>
              <Select 
                options={workerOptions} 
                placeholder="若已有接洽的社工請選擇" 
                className="border-gray-300 shadow-sm"
                {...formRegister('socialWorkerId')} 
              />
            </div>

            <div className="pt-2">
              <Button type="submit" className="w-full text-base py-5" disabled={isSubmitting}>
                {isSubmitting ? '處理中...' : '確認註冊'}
              </Button>
            </div>

            <div className="text-center mt-4 text-sm text-gray-600">
              已經有帳號了？ <Link href="/login" className="text-blue-600 font-medium hover:underline">返回登入</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}