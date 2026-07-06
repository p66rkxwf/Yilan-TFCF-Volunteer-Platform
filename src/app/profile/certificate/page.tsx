"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getProfile } from "@/lib/actions/profiles";
import {
  getMyHoursSummary,
  type HoursSummary,
} from "@/lib/actions/registrations";
import { ProfilePageHeader } from "../profile-page-header";

const PRINT_STYLE = `
@media print {
  body * { visibility: hidden !important; }
  #service-certificate, #service-certificate * { visibility: visible !important; }
  #service-certificate {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    padding: 0;
  }
  .no-print { display: none !important; }
}
`;

export default function CertificatePage() {
  const [fullName, setFullName] = useState("");
  const [summary, setSummary] = useState<HoursSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [profile, hours] = await Promise.all([
        getProfile(),
        getMyHoursSummary(),
      ]);
      setFullName(profile?.full_name ?? "");
      setSummary(hours);
      setIsLoading(false);
    }
    load();
  }, []);

  const today = new Date().toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">
          progress_activity
        </span>
      </div>
    );
  }

  const hasHours = summary != null && summary.totalHours > 0;

  return (
    <>
      <style>{PRINT_STYLE}</style>

      <ProfilePageHeader
        title="服務時數紀錄"
        noPrint
        actions={
          <>
            <Link
              href="/profile/registrations"
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            >
              返回報名紀錄
            </Link>
            {hasHours ? (
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
              >
                <span className="material-symbols-outlined text-[18px]">print</span>
                列印 / 另存 PDF
              </button>
            ) : null}
          </>
        }
      />

      <div className="flex-1 overflow-y-auto p-5 md:p-8">
        {!hasHours ? (
          <div className="no-print mx-auto max-w-2xl py-16 text-center">
            <span className="material-symbols-outlined mb-3 block text-5xl text-slate-300">
              workspace_premium
            </span>
            <p className="text-sm text-slate-500">
              目前尚無已認列的服務時數，完成活動並由管理員登記出席後即可在此查看紀錄。
            </p>
          </div>
        ) : (
          <div id="service-certificate" className="mx-auto max-w-3xl bg-white py-6 md:py-8">
            <div className="mb-8 border-b-2 border-primary pb-6 text-center">
              <h2 className="text-2xl font-bold text-slate-900">服務時數紀錄</h2>
              <p className="mt-1 text-sm text-slate-500">宜蘭家扶中心</p>
            </div>

            <div className="space-y-2 text-slate-700 leading-relaxed mb-8">
              <p>
                志工{" "}
                <span className="font-bold text-slate-900 text-lg">{fullName || "（未填寫姓名）"}</span>{" "}
                於本中心參與志工服務活動，累計出席{" "}
                <span className="font-bold text-primary">{summary.attendedCount}</span>{" "}
                場，服務時數合計{" "}
                <span className="font-bold text-primary text-lg">{summary.totalHours}</span>{" "}
                小時。
              </p>
            </div>

            <table className="w-full border-collapse text-left mb-8">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="py-3 text-sm font-bold text-slate-500">活動名稱</th>
                  <th className="py-3 text-sm font-bold text-slate-500 whitespace-nowrap">活動日期</th>
                  <th className="py-3 text-sm font-bold text-slate-500 text-right whitespace-nowrap">服務時數</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.entries.map((entry) => (
                  <tr key={entry.registration_id}>
                    <td className="py-3 text-sm text-slate-800">{entry.activity_title}</td>
                    <td className="py-3 text-sm text-slate-500 whitespace-nowrap">
                      {entry.session_start_at
                        ? new Date(entry.session_start_at).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })
                        : "—"}
                    </td>
                    <td className="py-3 text-sm text-slate-800 text-right font-semibold whitespace-nowrap">
                      {entry.hours} 小時
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200">
                  <td className="py-3 text-sm font-bold text-slate-900" colSpan={2}>
                    合計
                  </td>
                  <td className="py-3 text-right text-sm font-black text-primary whitespace-nowrap">
                    {summary.totalHours} 小時
                  </td>
                </tr>
              </tfoot>
            </table>

            <div className="pt-8">
              <p className="text-sm text-slate-500">資料時間：{today}</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
