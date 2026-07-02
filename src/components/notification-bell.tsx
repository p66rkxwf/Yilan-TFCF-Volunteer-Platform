"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getUnreadCount } from "@/lib/actions/notifications";

// Notification bell with unread badge, links to the notifications page.
// Used in profile page headers (mobile), where the bottom nav omits 通知.
export function NotificationBell({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let active = true;
    getUnreadCount().then((count) => {
      if (active) setUnreadCount(count);
    });
    return () => {
      active = false;
    };
  }, [pathname]);

  return (
    <Link
      href="/profile/notifications"
      aria-label={unreadCount > 0 ? `通知（${unreadCount} 則未讀）` : "通知"}
      className={`relative flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 ${className}`}
    >
      <span className="material-symbols-outlined">notifications</span>
      {unreadCount > 0 ? (
        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-white">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </Link>
  );
}
