import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  inputSize?: "sm" | "md" | "lg";
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, inputSize = "md", className = "", ...props }, ref) => {
    const sizeClasses = {
      sm: "px-3 py-2 text-sm",
      md: "px-4 py-2.5 text-base",
      lg: "px-4 py-3 text-base",
    };

    const baseClasses = `w-full border rounded-lg bg-surface text-foreground placeholder-muted transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-zinc-300 focus:ring-offset-1 focus:ring-offset-background focus:border-transparent dark:bg-surface dark:text-foreground dark:focus:ring-zinc-600 ${sizeClasses[inputSize]}`;

    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-foreground mb-2">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`${baseClasses} ${
            error
              ? "border-red-500 focus:ring-red-500 focus:ring-1"
              : "border-border"
          } ${className}`}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-sm font-medium text-red-600">{error}</p>
        )}
        {helperText && !error && (
          <p className="mt-1.5 text-sm text-muted">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
