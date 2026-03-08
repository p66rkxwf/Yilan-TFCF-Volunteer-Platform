"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function TestPage() {

  const [data, setData] = useState<any[]>([])

  useEffect(() => {
    const fetchData = async () => {

      const { data, error } = await supabase
        .from("test")
        .select("*")

      if (error) {
        console.log("error:", error)
      } else {
        setData(data)
      }
    }

    fetchData()
  }, [])

  return (
    <div>
      <h1>Supabase 測試</h1>

      <pre>
        {JSON.stringify(data, null, 2)}
      </pre>

    </div>
  )
}