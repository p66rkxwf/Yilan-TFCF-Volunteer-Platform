"use client";

// 學生名冊：查詢、篩選（狀態／學制／黑名單／地區）。點入學生詳情。

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import {
  PageHeader,
  Panel,
  StatusPill,
  TableShell,
  Th,
  Td,
  EmptyRow,
  LoadingRow,
  Toolbar,
  SearchInput,
  Pagination,
} from "@/components/admin/ui";
import { Select } from "@/components/ui/select";
import { VOLUNTEER_STATUS } from "@/lib/admin/labels";
import { GRADE_LEVEL_LABELS } from "@/lib/types/database";
import type { GradeLevel, VolunteerStatus } from "@/lib/types/database";

const PAGE_SIZE = 25;

interface VolunteerRow {
  id: string;
  full_name: string;
  phone: string;
  region: string | null;
  grade: GradeLevel;
  status: VolunteerStatus;
  is_blacklisted: boolean;
  worker: { full_name: string } | null;
}

export default function VolunteersPage() {
  const supabase = createClient();
  const toast = useToast();

  const [rows, setRows] = useState<VolunteerRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [blacklistFilter, setBlacklistFilter] = useState("all");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("volunteer_profiles")
      .select("id, full_name, phone, region, grade, status, is_blacklisted, worker:assigned_worker_id(full_name)")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) toast.error(`載入學生失敗：${error.message}`);
    else setRows((data ?? []) as unknown as VolunteerRow[]);
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (gradeFilter !== "all" && row.grade !== gradeFilter) return false;
      if (blacklistFilter === "yes" && !row.is_blacklisted) return false;
      if (blacklistFilter === "no" && row.is_blacklisted) return false;
      const q = search.trim();
      if (q && !row.full_name.includes(q) && !row.phone.includes(q) && !(row.region ?? "").includes(q))
        return false;
      return true;
    });
  }, [rows, statusFilter, gradeFilter, blacklistFilter, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const resetPage = () => setPage(1);

  return (
    <>
      <PageHeader
        title="學生名冊"
        description="全機構學生總覽；點姓名查看詳情與時數、報名、黑名單紀錄。"
        actions={
          <Link
            href="/admin/volunteers/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            手動新增學生
          </Link>
        }
      />

      <div className="flex-1 p-4 sm:p-6">
        <Panel padded={false}>
          <Toolbar>
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                resetPage();
              }}
              placeholder="搜尋姓名、電話或地區…"
              className="w-56"
            />
            <div className="w-32">
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v);
                  resetPage();
                }}
                options={[
                  { value: "all", label: "全部狀態" },
                  ...Object.entries(VOLUNTEER_STATUS).map(([value, meta]) => ({
                    value,
                    label: meta.label,
                  })),
                ]}
              />
            </div>
            <div className="w-28">
              <Select
                value={gradeFilter}
                onValueChange={(v) => {
                  setGradeFilter(v);
                  resetPage();
                }}
                options={[
                  { value: "all", label: "全部學制" },
                  ...Object.entries(GRADE_LEVEL_LABELS).map(([value, label]) => ({ value, label })),
                ]}
              />
            </div>
            <div className="w-28">
              <Select
                value={blacklistFilter}
                onValueChange={(v) => {
                  setBlacklistFilter(v);
                  resetPage();
                }}
                options={[
                  { value: "all", label: "黑名單全部" },
                  { value: "yes", label: "黑名單中" },
                  { value: "no", label: "非黑名單" },
                ]}
              />
            </div>
            <p className="ml-auto text-xs text-slate-400">共 {filtered.length} 人</p>
          </Toolbar>

          <TableShell>
            <thead>
              <tr>
                <Th>姓名</Th>
                <Th>學制</Th>
                <Th>地區</Th>
                <Th>電話</Th>
                <Th>負責社工</Th>
                <Th>狀態</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <LoadingRow colSpan={6} />
              ) : paged.length === 0 ? (
                <EmptyRow colSpan={6} message="沒有符合條件的學生" />
              ) : (
                paged.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-slate-50">
                    <Td>
                      <Link
                        href={`/admin/volunteers/${row.id}`}
                        className="font-semibold text-slate-900 hover:text-primary"
                      >
                        {row.full_name}
                      </Link>
                      {row.is_blacklisted && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                          黑名單
                        </span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">{GRADE_LEVEL_LABELS[row.grade]}</Td>
                    <Td className="text-slate-500">{row.region ?? "—"}</Td>
                    <Td className="text-slate-500">{row.phone}</Td>
                    <Td className="text-slate-500">{row.worker?.full_name ?? "—"}</Td>
                    <Td>
                      <StatusPill meta={VOLUNTEER_STATUS[row.status]} />
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </TableShell>

          <Pagination
            page={currentPage}
            pageCount={pageCount}
            onPageChange={setPage}
            totalCount={filtered.length}
          />
        </Panel>
      </div>
    </>
  );
}
