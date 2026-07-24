"use client";

// 批量匯入職員（限系統管理員）：下載 CSV 範本 → 填寫 → 上傳 → 預覽 → 建立。
// 密碼一律＝帳號，首次登入強制改密碼（由 bulkCreateStaff 與 must_change_password 機制強制）。

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { useAdminProfile } from "../../admin-context";
import { bulkCreateStaff, type BulkStaffRow, type BulkStaffResult } from "@/lib/actions/bulk-staff";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel, TableShell, Th, Td, EmptyRow } from "@/components/admin/ui";
import { STAFF_ROLE, STAFF_JOB_TITLE } from "@/lib/admin/labels";
import { toCsv, downloadCsv } from "@/utils/csv";
import type { StaffRole, StaffJobTitle } from "@/lib/types/database";

const HEADERS = ["姓名", "帳號", "Email", "電話", "角色", "職稱", "地區"];

// 角色／職稱：接受中文標籤或英文代碼
const ROLE_MAP: Record<string, StaffRole> = {
  系統管理員: "system_admin",
  單位管理員: "unit_admin",
  一般職員: "staff",
  職員: "staff",
  system_admin: "system_admin",
  unit_admin: "unit_admin",
  staff: "staff",
};
const JOB_MAP: Record<string, StaffJobTitle> = {
  社工: "social_worker",
  其他: "other",
  social_worker: "social_worker",
  other: "other",
};

interface PreviewRow extends BulkStaffRow {
  rawRole: string;
  rawJob: string;
  roleValid: boolean;
  jobValid: boolean;
}

// 極簡 CSV 解析：支援雙引號包裹、跳脫 ""、CRLF/LF、BOM。
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export default function BulkStaffPage() {
  const router = useRouter();
  const toast = useToast();
  const profile = useAdminProfile();

  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [results, setResults] = useState<BulkStaffResult[] | null>(null);

  useEffect(() => {
    if (profile.role !== "system_admin") {
      toast.error("僅系統管理員可批量匯入職員");
      router.replace("/admin/staff");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const downloadTemplate = () => {
    const example = [
      "王小明", "ming01", "ming@example.com", "0912345678", "一般職員", "社工", "宜蘭市",
    ];
    downloadCsv("職員批量匯入範本", toCsv(HEADERS, [example]));
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResults(null);
    const text = await file.text();
    const matrix = parseCsv(text);
    if (matrix.length === 0) {
      toast.error("檔案是空的");
      setRows([]);
      return;
    }
    // 若首列看起來是標題（含「帳號」），略過
    const start = matrix[0].join("").includes("帳號") ? 1 : 0;
    const parsed: PreviewRow[] = matrix.slice(start).map((cols) => {
      const [fullName = "", username = "", email = "", phone = "", roleRaw = "", jobRaw = "", region = ""] =
        cols.map((c) => c.trim());
      const role = ROLE_MAP[roleRaw];
      const jobTitle = JOB_MAP[jobRaw];
      return {
        fullName, username, email, phone,
        role: role ?? ("staff" as StaffRole),
        jobTitle: jobTitle ?? ("other" as StaffJobTitle),
        region,
        rawRole: roleRaw,
        rawJob: jobRaw,
        roleValid: !!role,
        jobValid: !!jobRaw && !!jobTitle,
      };
    });
    setRows(parsed);
    e.target.value = "";
  };

  const invalidCount = useMemo(
    () => rows.filter((r) => !r.roleValid || !r.jobValid || !r.fullName || !r.username).length,
    [rows]
  );

  const handleSubmit = async () => {
    if (rows.length === 0) return void toast.error("請先上傳 CSV");
    setIsSaving(true);
    const payload: BulkStaffRow[] = rows.map((r) => ({
      fullName: r.fullName,
      username: r.username,
      email: r.email,
      phone: r.phone,
      role: r.role,
      jobTitle: r.jobTitle,
      region: r.region,
    }));
    const res = await bulkCreateStaff(payload);
    setIsSaving(false);
    if (res.error) return void toast.error(res.error);
    setResults(res.results ?? []);
    const ok = (res.results ?? []).filter((r) => r.ok).length;
    const fail = (res.results ?? []).length - ok;
    if (fail === 0) toast.success(`已建立 ${ok} 位職員`);
    else toast.error(`成功 ${ok} 筆，失敗 ${fail} 筆，詳見下方結果`);
  };

  return (
    <>
      <PageHeader
        title="批量匯入職員"

        backHref="/admin/staff"
        backLabel="職員管理"
        actions={
          <Button size="sm" variant="outline" onClick={downloadTemplate}>
            下載 CSV 範本
          </Button>
        }
      />

      <div className="flex-1 space-y-5 p-4 sm:p-6">
        <Panel title="上傳 CSV">
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              欄位：{HEADERS.join("、")}。角色可填「系統管理員／單位管理員／一般職員」，
              職稱可填「社工／其他」。地區可留空。
            </p>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">upload_file</span>
              選擇 CSV 檔
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
            </label>
            {fileName && <span className="ml-2 text-xs text-slate-400">{fileName}</span>}
          </div>
        </Panel>

        {rows.length > 0 && (
          <Panel
            title={`預覽（共 ${rows.length} 筆${invalidCount > 0 ? `，${invalidCount} 筆有問題` : ""}）`}
            padded={false}
          >
            <TableShell>
              <thead>
                <tr>
                  <Th>姓名</Th>
                  <Th>帳號</Th>
                  <Th>Email</Th>
                  <Th>電話</Th>
                  <Th>角色</Th>
                  <Th>職稱</Th>
                  <Th>地區</Th>
                  <Th>結果</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const result = results?.find((x) => x.index === i);
                  return (
                    <tr key={i} className="hover:bg-slate-50">
                      <Td className={r.fullName ? "" : "text-amber-700"}>{r.fullName || "缺姓名"}</Td>
                      <Td className={r.username ? "font-medium" : "text-amber-700"}>{r.username || "缺帳號"}</Td>
                      <Td className="text-slate-500">{r.email}</Td>
                      <Td className="text-slate-500">{r.phone}</Td>
                      <Td className={r.roleValid ? "" : "text-amber-700"}>
                        {r.roleValid ? STAFF_ROLE[r.role] : `無效（${r.rawRole || "空"}）`}
                      </Td>
                      <Td className={r.jobValid ? "" : "text-amber-700"}>
                        {r.jobValid ? STAFF_JOB_TITLE[r.jobTitle] : `無效（${r.rawJob || "空"}）`}
                      </Td>
                      <Td className="text-slate-500">{r.region || "—"}</Td>
                      <Td>
                        {result ? (
                          result.ok ? (
                            <span className="text-xs font-semibold text-emerald-600">✓ 已建立</span>
                          ) : (
                            <span className="text-xs font-semibold text-amber-700">{result.error}</span>
                          )
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableShell>
          </Panel>
        )}

        {rows.length === 0 && (
          <Panel padded={false}>
            <TableShell>
              <thead>
                <tr>
                  <Th>尚未上傳資料</Th>
                </tr>
              </thead>
              <tbody>
                <EmptyRow colSpan={1} message="請先下載範本並上傳填好的 CSV" />
              </tbody>
            </TableShell>
          </Panel>
        )}

        {rows.length > 0 && !results && (
          <div className="flex items-center gap-3">
            <Button size="sm" isLoading={isSaving} onClick={handleSubmit}>
              建立 {rows.length} 位職員
            </Button>
            {invalidCount > 0 && (
              <span className="text-xs text-amber-600">
                有 {invalidCount} 筆欄位無效，這些列會建立失敗並於結果列出。
              </span>
            )}
          </div>
        )}

        {results && (
          <div className="flex items-center gap-3">
            <Button size="sm" variant="outline" onClick={() => router.push("/admin/staff")}>
              返回職員管理
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
