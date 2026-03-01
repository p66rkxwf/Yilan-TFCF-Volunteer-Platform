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
      "inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 whitespace-nowrap shrink-0";
    const variants = {
      primary: "bg-linear-to-r from-blue-600 to-blue-700 text-white hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 focus:ring-blue-500",
      secondary: "bg-gray-200 text-gray-900 hover:bg-gray-300 hover:shadow-md active:bg-gray-200 focus:ring-gray-400",
      outline: "border-2 border-blue-600 text-blue-600 hover:bg-blue-50 hover:shadow-md active:bg-blue-100 focus:ring-blue-500",
      danger: "bg-red-600 text-white hover:bg-red-700 hover:shadow-md active:bg-red-800 focus:ring-red-500",
      ghost: "text-gray-700 hover:bg-gray-100 active:bg-gray-200 focus:ring-gray-300",
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
            <span className="animate-spin mr-2">⏳</span>
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
