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
    primary: "bg-blue-100 text-blue-800 font-semibold",
    success: "bg-green-100 text-green-800 font-semibold",
    warning: "bg-yellow-100 text-yellow-800 font-semibold",
    danger: "bg-red-100 text-red-800 font-semibold",
    gray: "bg-gray-100 text-gray-800 font-medium",
  };

  const sizes = {
    sm: "px-2.5 py-1 text-xs rounded-md",
    md: "px-3 py-1.5 text-sm rounded-lg",
    lg: "px-4 py-2 text-base rounded-lg",
  };

  return (
    <span
      className={`inline-block ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
