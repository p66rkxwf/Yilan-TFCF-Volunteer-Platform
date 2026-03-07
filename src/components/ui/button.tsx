import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      isLoading = false,
      disabled = false,
      fullWidth = false,
      className = "",
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-0 active:outline-none whitespace-nowrap shrink-0";
    const variants = {
      primary:
        "bg-foreground text-background hover:opacity-90 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 dark:bg-foreground dark:text-background",
      secondary:
        "bg-zinc-200 text-zinc-900 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-600",
      outline:
        "border-2 border-zinc-300 text-foreground bg-transparent hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800",
      danger:
        "bg-red-600 text-white hover:bg-red-700 hover:shadow-md active:bg-red-800",
      ghost:
        "text-foreground hover:bg-zinc-100 active:bg-zinc-200 dark:hover:bg-zinc-800 dark:active:bg-zinc-700",
    };

    const sizes = {
      sm: "px-4 sm:px-5 py-2 text-sm",
      md: "px-6 sm:px-8 py-2.5 sm:py-3 text-sm sm:text-base",
      lg: "px-8 sm:px-10 py-3 sm:py-4 text-base sm:text-lg",
    };

    const widthClass = fullWidth ? "w-full" : "";

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${widthClass} ${className}`}
        {...props}
      >
        {isLoading ? (
          <>
            <span className="animate-spin mr-2"></span>
            處理中...
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
