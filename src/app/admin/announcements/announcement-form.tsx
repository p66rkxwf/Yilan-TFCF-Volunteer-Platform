"use client";

// 公告表單（新增／編輯共用）：Markdown 內容，附即時預覽。
// 發布時間（published_at）於狀態轉為已發布時自動帶入。

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/ui/toast-actions";
import { Button } from "@/components/ui/button";
import { Field, inputClass, Panel } from "@/components/admin/ui";
import { MarkdownEditor } from "@/components/admin/markdown-editor";
import type { Announcement, AnnouncementStatus } from "@/lib/types/database";

export function AnnouncementForm({
  announcement,
  currentUserId,
}: {
  announcement?: Announcement;
  currentUserId: string;
}) {
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();
  const isEdit = Boolean(announcement);

  const [title, setTitle] = useState(announcement?.title ?? "");
  const [content, setContent] = useState(announcement?.content ?? "");
  const [isPinned, setIsPinned] = useState(announcement?.is_pinned ?? false);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; content?: string }>({});

  const save = async (publish: boolean) => {
    const nextErrors: typeof errors = {};
    if (!title.trim()) nextErrors.title = "請輸入公告標題";
    if (!content.trim()) nextErrors.content = "請輸入公告內容";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSaving(true);
    try {
      // 已發布公告再次儲存時維持發布狀態；草稿可選擇「儲存草稿」或「儲存並發布」。
      const nextStatus: AnnouncementStatus =
        publish || announcement?.status === "published" ? "published" : "draft";
      const shouldStampPublishedAt =
        nextStatus === "published" && !announcement?.published_at;

      const payload: Record<string, unknown> = {
        title: title.trim(),
        content: content.trim(),
        is_pinned: isPinned,
        status: nextStatus,
      };
      if (shouldStampPublishedAt) payload.published_at = new Date().toISOString();

      if (isEdit && announcement) {
        const { error } = await supabase
          .from("announcements")
          .update(payload)
          .eq("id", announcement.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("announcements")
          .insert({ ...payload, created_by: currentUserId });
        if (error) throw error;
      }

      toast.success(nextStatus === "published" ? "公告已發布" : "草稿已儲存");
      router.push("/admin/announcements");
      router.refresh();
    } catch (error) {
      toast.error(`儲存失敗：${getErrorMessage(error as Error)}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-5">
      <Panel title="公告內容">
        <div className="space-y-4">
          <Field label="標題" required error={errors.title}>
            <input
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </Field>

          <Field label="內容" required error={errors.content}>
            <MarkdownEditor value={content} onChange={setContent} minHeightClass="min-h-48" />
          </Field>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/30"
            />
            <span className="font-medium text-slate-700">置頂此公告</span>
          </label>
        </div>
      </Panel>

      <div className="flex flex-wrap items-center gap-2">
        {announcement?.status === "published" ? (
          <Button size="sm" isLoading={isSaving} onClick={() => save(true)}>
            儲存變更
          </Button>
        ) : (
          <>
            <Button size="sm" isLoading={isSaving} onClick={() => save(true)}>
              儲存並發布
            </Button>
            <Button size="sm" variant="outline" isLoading={isSaving} onClick={() => save(false)}>
              儲存草稿
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" onClick={() => router.back()}>
          取消
        </Button>
      </div>
    </div>
  );
}
