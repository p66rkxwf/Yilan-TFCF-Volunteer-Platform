"use client";

// Cloudflare Turnstile 小工具（明確渲染模式）。僅在有 site key 時由表單掛載
// （/support、/register）。使用者完成驗證後透過 onToken 回傳 token；過期或
// 錯誤則回傳 null 要求重驗。
//
// token 為一次性且約 300 秒過期：
// - "refresh-expired": "auto" 讓 widget 在 token 過期時自動重新驗證，
//   避免使用者填表太久後送出即失敗。
// - 送出（成功或伺服器端驗證失敗）後 token 已被 siteverify 消耗，表單需經
//   ref 呼叫 reset() 取得新 token，否則同頁第二次送出必被擋下。

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      "refresh-expired"?: "auto" | "manual" | "never";
    }
  ) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export interface TurnstileHandle {
  /** 重置 widget 要求重新驗證（送出後 token 已消耗時使用）。 */
  reset: () => void;
}

export const TurnstileWidget = forwardRef<
  TurnstileHandle,
  {
    siteKey: string;
    onToken: (token: string | null) => void;
  }
>(function TurnstileWidget({ siteKey, onToken }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
      }
      onToken(null);
    },
  }));

  useEffect(() => {
    let cancelled = false;

    const renderWidget = () => {
      if (cancelled || !containerRef.current || widgetIdRef.current) return;
      if (!window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token) => onToken(token),
        "expired-callback": () => onToken(null),
        "error-callback": () => onToken(null),
        "refresh-expired": "auto",
      });
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${SCRIPT_SRC}"]`
      );
      if (existing) {
        existing.addEventListener("load", renderWidget, { once: true });
      } else {
        const script = document.createElement("script");
        script.src = SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        script.addEventListener("load", renderWidget, { once: true });
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  return <div ref={containerRef} className="mt-4" />;
});
