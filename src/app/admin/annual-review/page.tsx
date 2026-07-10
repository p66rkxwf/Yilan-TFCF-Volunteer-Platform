"use client";

// 年度審查：系統以 8/31 為基準日計算學年度年齡，比對各階段參考年齡，
// 產出建議清單。管理員逐一：更新階段／僅標記已審查／標記畢業結案。
// 不做系統自動遞增（延畢等特例需人工判斷）。

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/ui/toast-actions";
import { useAdminProfile } from "../admin-context";
import { setVolunteerStatus } from "@/lib/actions/admin-users";
import {
  PageHeader,
  Panel,
  TableShell,
  Th,
  Td,
  EmptyRow,
  LoadingRow,
  RowActionMenu,
} from "@/components/admin/ui";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select } from "@/components/ui/select";
import { GRADE_LEVEL_LABELS } from "@/lib/types/database";
import { formatDate } from "@/lib/admin/datetime";
import type { AnnualGradeReviewRow, GradeLevel } from "@/lib/types/database";

export default function AnnualReviewPage() {
  const supabase = createClient();
  const toast = useToast();
  const profile = useAdminProfile();
  const isAdmin = profile.role === "system_admin" || profile.role === "unit_admin";

  const [rows, setRows] = useState<AnnualGradeReviewRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingGrade, setPendingGrade] = useState<Record<string, GradeLevel>>({});
  const [actingId, setActingId] = useState<string | null>(null);
  // 畢業結案會連動取消未來報名，先確認
  const [graduateTarget, setGraduateTarget] = useState<AnnualGradeReviewRow | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("v_annual_grade_review_list")
      .select("*")
      .order("age_at_aug31", { ascending: false });
    if (error) toast.error(`載入審查清單失敗：${error.message}`);
    else setRows((data ?? []) as AnnualGradeReviewRow[]);
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateGrade = async (row: AnnualGradeReviewRow, onlyMark: boolean) => {
    setActingId(row.id);
    try {
      const newGrade = onlyMark ? null : pendingGrade[row.id] ?? null;
      if (!onlyMark && !newGrade) {
        throw new Error("請先選擇新的學制階段");
      }
      const { error } = await supabase.rpc("rpc_update_volunteer_grade", {
        p_volunteer_id: row.id,
        p_new_grade: newGrade,
      });
      if (error) throw error;
      toast.success(onlyMark ? "已標記為已審查" : "已更新學制階段");
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error as Error));
    } finally {
      setActingId(null);
    }
  };

  const confirmGraduate = async () => {
    if (!graduateTarget) return;
    setActingId(graduateTarget.id);
    const result = await setVolunteerStatus(graduateTarget.id, "graduated");
    setActingId(null);
    if (result.error && !result.success) return void toast.error(result.error);
    toast.success("已標記畢業結案");
    setGraduateTarget(null);
    await load();
  };

  return (
    <>
      <PageHeader
        title="年度審查"
        description="每年 7–8 月使用；以 8/31 為基準日計算學年度年齡，達參考年齡者列入建議清單。"
      />

      <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
        <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
          清單僅為建議：達到（或超過）該階段參考年齡的在職學生會被列入，研究所與博士每年全數列入。
          請逐一判斷後更新階段、標記已審查，或標記畢業結案。系統不自動遞增階段。
        </div>

        <Panel padded={false} fill>
          <TableShell>
            <thead>
              <tr>
                <Th>姓名</Th>
                <Th>目前學制</Th>
                <Th className="text-right">8/31 學年齡</Th>
                <Th className="text-right">參考年齡</Th>
                <Th>上次審查</Th>
                {isAdmin && <Th>更新為</Th>}
                {isAdmin && <Th className="text-right">操作</Th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <LoadingRow colSpan={7} />
              ) : rows.length === 0 ? (
                <EmptyRow colSpan={7} message="目前沒有需審查的學生" />
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-slate-50">
                    <Td>
                      <Link
                        href={`/admin/volunteers/${row.id}`}
                        className="font-semibold text-slate-900 hover:text-primary"
                      >
                        {row.full_name}
                      </Link>
                    </Td>
                    <Td className="whitespace-nowrap">{GRADE_LEVEL_LABELS[row.grade]}</Td>
                    <Td className="text-right font-semibold text-slate-900">{row.age_at_aug31}</Td>
                    <Td className="text-right text-slate-500">
                      {row.reference_age ?? "全數列入"}
                    </Td>
                    <Td className="whitespace-nowrap text-slate-500">
                      {row.last_grade_reviewed_at ? formatDate(row.last_grade_reviewed_at) : "尚未審查"}
                    </Td>
                    {isAdmin && (
                      <Td className="w-32">
                        <Select
                          value={pendingGrade[row.id] ?? ""}
                          onValueChange={(v) =>
                            setPendingGrade((prev) => ({ ...prev, [row.id]: v as GradeLevel }))
                          }
                          placeholder="選擇階段"
                          options={Object.entries(GRADE_LEVEL_LABELS).map(([value, label]) => ({
                            value,
                            label,
                          }))}
                          triggerClassName="py-1.5 text-xs"
                        />
                      </Td>
                    )}
                    {isAdmin && (
                      <Td className="text-right">
                        <RowActionMenu
                          ariaLabel={`${row.full_name} 的操作`}
                          actions={[
                            {
                              label: "更新學制",
                              icon: "upgrade",
                              disabled: actingId === row.id,
                              onSelect: () => updateGrade(row, false),
                            },
                            {
                              label: "僅標記已審",
                              icon: "task_alt",
                              disabled: actingId === row.id,
                              onSelect: () => updateGrade(row, true),
                            },
                            {
                              label: "畢業結案",
                              icon: "school",
                              disabled: actingId === row.id,
                              onSelect: () => setGraduateTarget(row),
                            },
                          ]}
                        />
                      </Td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </TableShell>
        </Panel>
      </div>

      <ConfirmDialog
        open={graduateTarget !== null}
        title={graduateTarget ? `標記 ${graduateTarget.full_name} 畢業結案？` : ""}
        description="畢業結案將保留資料與登入，僅停止報名，並自動取消尚未開始的有效報名（可於學生詳情頁復職）。"
        isLoading={actingId === graduateTarget?.id}
        onConfirm={confirmGraduate}
        onClose={() => setGraduateTarget(null)}
      />
    </>
  );
}
