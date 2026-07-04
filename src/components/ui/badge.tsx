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
    primary: "bg-zinc-200 text-zinc-900 font-semibold",
    success: "bg-zinc-200 text-zinc-800 font-semibold",
    warning: "bg-zinc-300 text-zinc-900 font-semibold",
    danger: "bg-red-100 text-red-800 font-semibold",
    gray: "bg-zinc-100 text-zinc-700 font-medium",
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
