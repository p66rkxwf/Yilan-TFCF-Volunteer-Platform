"use client";

// 學生詳情頁的唯讀區塊。全部只吃 props、不持有狀態，把 page.tsx 留給資料載入
// 與操作流程。

import Link from "next/link";
import {
  Panel,
  StatusPill,
  TableShell,
  Th,
  Td,
  EmptyRow,
  DescriptionItem,
} from "@/components/admin/ui";
import {
  VOLUNTEER_STATUS,
  REGISTRATION_STATUS,
  ATTENDANCE_STATUS,
  CANCEL_REASON,
} from "@/lib/admin/labels";
import { GRADE_LEVEL_LABELS } from "@/lib/types/database";
import { formatDate, formatDateTime, formatSessionRange } from "@/lib/admin/datetime";
import type {
  VolunteerProfile,
  RegistrationStatus,
  AttendanceStatus,
  CancelReason,
  BlacklistEvent,
} from "@/lib/types/database";

export type VolunteerDetail = VolunteerProfile & {
  worker: { full_name: string } | null;
};

export interface RegRow {
  id: string;
  status: RegistrationStatus;
  attendance: AttendanceStatus | null;
  service_hours: number | null;
  cancel_reason: CancelReason | null;
  session: {
    start_at: string;
    end_at: string;
    activity: { id: string; title: string } | null;
  } | null;
}

export interface BlacklistRow extends BlacklistEvent {
  releaser: { full_name: string } | null;
}

export function ProfilePanel({
  volunteer,
  isAdmin,
  onEdit,
  onReassign,
}: {
  volunteer: VolunteerDetail;
  isAdmin: boolean;
  onEdit: () => void;
  onReassign: () => void;
}) {
  return (
    <Panel
      title="基本資料"
      action={
        <button
          type="button"
          onClick={onEdit}
          className="text-xs font-semibold text-primary hover:text-primary/80"
        >
          編輯
        </button>
      }
    >
      <dl className="space-y-3">
        <DescriptionItem label="狀態">
          <span className="inline-flex items-center gap-2">
            <StatusPill meta={VOLUNTEER_STATUS[volunteer.status]} />
            {volunteer.is_blacklisted && (
              <StatusPill meta={{ label: "黑名單中", badge: "bg-amber-100 text-amber-800" }} />
            )}
          </span>
        </DescriptionItem>
        <DescriptionItem label="帳號">{volunteer.username}</DescriptionItem>
        <DescriptionItem label="Email">{volunteer.email}</DescriptionItem>
        <DescriptionItem label="電話">{volunteer.phone}</DescriptionItem>
        <DescriptionItem label="地區">{volunteer.region ?? "—"}</DescriptionItem>
        <DescriptionItem label="學制">{GRADE_LEVEL_LABELS[volunteer.grade]}</DescriptionItem>
        <DescriptionItem label="生日">{formatDate(volunteer.birth_date)}</DescriptionItem>
        <DescriptionItem label="負責社工">
          <span className="inline-flex items-center gap-2">
            {volunteer.worker?.full_name ?? "—"}
            {isAdmin && (
              <button
                type="button"
                onClick={onReassign}
                className="rounded-lg px-2 py-0.5 text-xs font-semibold text-primary hover:bg-primary/10"
              >
                變更
              </button>
            )}
          </span>
        </DescriptionItem>
        <DescriptionItem label="上次階段審查">
          {volunteer.last_grade_reviewed_at
            ? formatDate(volunteer.last_grade_reviewed_at)
            : "尚未審查"}
        </DescriptionItem>
        <DescriptionItem label="最後上線">
          {volunteer.last_login_at ? formatDateTime(volunteer.last_login_at) : "尚未記錄"}
        </DescriptionItem>
      </dl>
    </Panel>
  );
}

export function HoursPanel({
  hours,
  threshold,
}: {
  hours: { total_hours: number; attended_sessions: number } | null;
  threshold: number | null;
}) {
  // 無出席紀錄者在 v_volunteer_hours 沒有資料列（hours 為 null），時數視為 0——
  // 否則 0 小時反而會被判定「已達標」。
  const totalHours = hours?.total_hours ?? 0;
  const belowThreshold = threshold != null && totalHours < threshold;

  return (
    <Panel title="服務時數">
      <div className="text-center">
        <p className="text-3xl font-bold text-slate-900">
          {totalHours}
          <span className="ml-1 text-base font-normal text-slate-400">小時</span>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          已確認出席 {hours?.attended_sessions ?? 0} 場
        </p>
        {threshold != null && (
          <div
            className={`mt-3 rounded-lg px-3 py-2 text-sm ${
              belowThreshold ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
            }`}
          >
            最低門檻 {threshold} 小時 ·{" "}
            {belowThreshold
              ? `尚差 ${Math.round((threshold - totalHours) * 10) / 10} 小時`
              : "已達標"}
          </div>
        )}
      </div>
    </Panel>
  );
}

export function RegistrationsPanel({ registrations }: { registrations: RegRow[] }) {
  return (
    <Panel title="報名紀錄" description={`共 ${registrations.length} 筆`} padded={false}>
      <TableShell>
        <thead>
          <tr>
            <Th>活動場次</Th>
            <Th>報名狀態</Th>
            <Th>出席</Th>
            <Th className="text-right">時數</Th>
          </tr>
        </thead>
        <tbody>
          {registrations.length === 0 ? (
            <EmptyRow colSpan={4} message="尚無報名紀錄" />
          ) : (
            registrations.map((reg) => (
              <tr key={reg.id} className="transition-colors hover:bg-slate-50">
                <Td>
                  {reg.session?.activity ? (
                    <Link prefetch={false}
                      href={`/admin/activities/${reg.session.activity.id}`}
                      className="font-medium text-slate-900 hover:text-primary"
                    >
                      {reg.session.activity.title}
                    </Link>
                  ) : (
                    "—"
                  )}
                  <p className="text-xs text-slate-400">
                    {reg.session
                      ? formatSessionRange(reg.session.start_at, reg.session.end_at)
                      : ""}
                  </p>
                </Td>
                <Td>
                  <StatusPill meta={REGISTRATION_STATUS[reg.status]} />
                  {reg.cancel_reason && (
                    <p className="mt-0.5 text-xs text-slate-400">
                      {CANCEL_REASON[reg.cancel_reason]}
                    </p>
                  )}
                </Td>
                <Td>
                  {reg.attendance ? (
                    <StatusPill meta={ATTENDANCE_STATUS[reg.attendance]} />
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </Td>
                <Td className="text-right">{reg.service_hours ?? "—"}</Td>
              </tr>
            ))
          )}
        </tbody>
      </TableShell>
    </Panel>
  );
}

export function BlacklistPanel({
  blacklist,
  showManageLink,
}: {
  blacklist: BlacklistRow[];
  showManageLink: boolean;
}) {
  return (
    <Panel
      title="黑名單事件"
      padded={false}
      action={
        showManageLink ? (
          <Link prefetch={false}
            href="/admin/blacklist"
            className="text-xs font-semibold text-primary hover:text-primary/80"
          >
            前往黑名單管理 →
          </Link>
        ) : undefined
      }
    >
      <TableShell>
        <thead>
          <tr>
            <Th>列入時間</Th>
            <Th>預計解除</Th>
            <Th>實際解除</Th>
            <Th>類型</Th>
            <Th>備註</Th>
          </tr>
        </thead>
        <tbody>
          {blacklist.length === 0 ? (
            <EmptyRow colSpan={5} message="無黑名單紀錄" />
          ) : (
            blacklist.map((event) => (
              <tr key={event.id} className="transition-colors hover:bg-slate-50">
                <Td className="whitespace-nowrap">{formatDateTime(event.triggered_at)}</Td>
                <Td className="whitespace-nowrap text-slate-500">
                  {formatDateTime(event.expected_release_at)}
                </Td>
                <Td className="whitespace-nowrap">
                  {event.released_at ? (
                    <span className="text-emerald-600">
                      {formatDateTime(event.released_at)}
                      <span className="ml-1 text-xs text-slate-400">
                        （{event.releaser?.full_name ?? "系統自動"}）
                      </span>
                    </span>
                  ) : (
                    <span className="font-semibold text-amber-700">生效中</span>
                  )}
                </Td>
                <Td>
                  {event.is_manual ? (
                    <span className="text-slate-600">手動</span>
                  ) : (
                    <span className="text-slate-600">自動（缺席）</span>
                  )}
                </Td>
                <Td className="text-slate-500">{event.note ?? "—"}</Td>
              </tr>
            ))
          )}
        </tbody>
      </TableShell>
    </Panel>
  );
}
