"use client";

// 管理員直接指派學生到場次（#29）：走與報名相同檢查（在職、非黑名單、
// 名額、時間衝突照擋），差異僅直接核准、不受截止限制、已截止活動仍可補人。

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/ui/toast-actions";
import { Button } from "@/components/ui/button";
import {
  PageHeader,
  Panel,
  StatusPill,
  TableShell,
  Th,
  Td,
  EmptyRow,
  LoadingRow,
  SearchInput,
} from "@/components/admin/ui";
import { formatSessionRange } from "@/lib/admin/datetime";
import type { ActivitySession } from "@/lib/types/database";

interface VolunteerRow {
  id: string;
  full_name: string;
  phone: string;
  region: string | null;
  is_blacklisted: boolean;
}

export default function AssignVolunteerPage() {
  const { activityId, sessionId } = useParams<{ activityId: string; sessionId: string }>();
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();

  const [session, setSession] = useState<ActivitySession | null>(null);
  const [activityTitle, setActivityTitle] = useState("");
  const [volunteers, setVolunteers] = useState<VolunteerRow[]>([]);
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    const [sessionRes, volunteersRes, regsRes] = await Promise.all([
      supabase
        .from("activity_sessions")
        .select("*, activities(title)")
        .eq("id", sessionId)
        .maybeSingle(),
      supabase
        .from("volunteer_profiles")
        .select("id, full_name, phone, region, is_blacklisted")
        .eq("status", "active")
        .order("full_name"),
      supabase
        .from("registrations")
        .select("volunteer_id")
        .eq("activity_session_id", sessionId)
        .in("status", ["pending", "approved", "cancel_pending"]),
    ]);

    if (sessionRes.error || !sessionRes.data) {
      toast.error("找不到此場次");
      router.push(`/admin/activities/${activityId}`);
      return;
    }
    setSession(sessionRes.data as any);
    setActivityTitle((sessionRes.data as any).activities?.title ?? "");
    setVolunteers((volunteersRes.data ?? []) as VolunteerRow[]);
    setAssignedIds(
      new Set(((regsRes.data ?? []) as { volunteer_id: string }[]).map((r) => r.volunteer_id))
    );
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim();
    return volunteers.filter((v) => {
      if (!q) return true;
      return v.full_name.includes(q) || (v.region ?? "").includes(q) || v.phone.includes(q);
    });
  }, [volunteers, search]);

  const handleAssign = async (volunteerId: string) => {
    setActingId(volunteerId);
    try {
      const { error } = await supabase.rpc("rpc_assign_volunteer", {
        p_session_id: sessionId,
        p_volunteer_id: volunteerId,
      });
      if (error) throw error;
      toast.success("已指派並直接核准，系統將通知學生");
      setAssignedIds((prev) => new Set(prev).add(volunteerId));
    } catch (error) {
      toast.error(getErrorMessage(error as Error));
    } finally {
      setActingId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="指派學生"
        description={
          session ? `${activityTitle}｜${formatSessionRange(session.start_at, session.end_at)}` : "—"
        }
        backHref={`/admin/activities/${activityId}`}
        backLabel="活動詳情"
      />

      <div className="flex-1 p-4 sm:p-6">
        <Panel padded={false}>
          <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="搜尋學生姓名、地區或電話…"
              className="max-w-sm"
            />
          </div>
          <TableShell>
            <thead>
              <tr>
                <Th>姓名</Th>
                <Th>地區</Th>
                <Th>電話</Th>
                <Th>黑名單</Th>
                <Th className="text-right">操作</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <LoadingRow colSpan={5} />
              ) : filtered.length === 0 ? (
                <EmptyRow colSpan={5} message="沒有符合的在職學生" />
              ) : (
                filtered.map((v) => {
                  const alreadyAssigned = assignedIds.has(v.id);
                  return (
                    <tr key={v.id} className="transition-colors hover:bg-slate-50">
                      <Td className="font-semibold text-slate-900">{v.full_name}</Td>
                      <Td className="text-slate-500">{v.region ?? "—"}</Td>
                      <Td className="text-slate-500">{v.phone}</Td>
                      <Td>
                        {v.is_blacklisted ? (
                          <StatusPill meta={{ label: "黑名單中", badge: "bg-amber-100 text-amber-800" }} />
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </Td>
                      <Td className="text-right">
                        {alreadyAssigned ? (
                          <span className="text-xs font-semibold text-emerald-600">已在名單</span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            isLoading={actingId === v.id}
                            disabled={v.is_blacklisted}
                            onClick={() => handleAssign(v.id)}
                          >
                            指派
                          </Button>
                        )}
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </TableShell>
        </Panel>
        <p className="mt-3 text-xs text-slate-400">
          指派走與學生報名相同的檢查：黑名單、名額、時間衝突都會擋下；差異僅為直接核准、不受報名截止限制。
        </p>
      </div>
    </>
  );
}
