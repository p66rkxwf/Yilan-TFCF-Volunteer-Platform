import React from "react";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "primary" | "success" | "warning" | "danger" | "gray";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Badge({
  children,
  variant = "primary",
  size = "md",
  className = "",
}: BadgeProps) {
  const variants = {
    primary: "bg-zinc-200 text-zinc-900 font-semibold dark:bg-zinc-700 dark:text-zinc-100",
    success: "bg-zinc-200 text-zinc-800 font-semibold dark:bg-zinc-600 dark:text-zinc-200",
    warning: "bg-zinc-300 text-zinc-900 font-semibold dark:bg-zinc-600 dark:text-zinc-100",
    danger: "bg-red-100 text-red-800 font-semibold dark:bg-red-900/40 dark:text-red-300",
    gray: "bg-zinc-100 text-zinc-700 font-medium dark:bg-zinc-800 dark:text-zinc-300",
  };

  const sizes = {
    sm: "px-2.5 py-1 text-xs rounded-md",
    md: "px-3 py-1.5 text-sm rounded-lg",
    lg: "px-4 py-2 text-base rounded-lg",
  };

  return (
    <span
      className={`inline-block whitespace-nowrap shrink-0 ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
