import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: CardProps) {
  return (
    <div
      className={`bg-card rounded-xl border border-border shadow-sm hover:shadow-lg hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-300 ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className = "",
}: CardProps) {
  return (
    <div className={`px-6 sm:px-8 py-5 sm:py-6 border-b border-border ${className}`}>
      {children}
    </div>
  );
}

export function CardBody({ children, className = "" }: CardProps) {
  return <div className={`px-6 sm:px-8 py-5 sm:py-6 ${className}`}>{children}</div>;
}

export function CardFooter({ children, className = "" }: CardProps) {
  return (
    <div className={`px-6 sm:px-8 py-5 sm:py-6 border-t border-border ${className}`}>
      {children}
    </div>
  );
}
