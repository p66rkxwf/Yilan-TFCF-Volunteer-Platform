"use client";

import * as React from "react";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  name?: string;
  id?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  optionClassName?: string;
}

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  (
    {
      options,
      value,
      onValueChange,
      placeholder = "請選擇",
      name,
      id,
      disabled = false,
      ariaLabel,
      className,
      triggerClassName,
      menuClassName,
      optionClassName,
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const [activeIndex, setActiveIndex] = React.useState(-1);
    const rootRef = React.useRef<HTMLDivElement>(null);
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
    const generatedId = React.useId();
    const triggerId = id ?? `select-${generatedId}`;
    const listboxId = `${triggerId}-listbox`;

    const selectedIndex = options.findIndex((option) => option.value === value);
    const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;
    const displayLabel = selectedOption?.label ?? placeholder;

    const focusableIndexes = options.reduce<number[]>((indexes, option, index) => {
      if (!option.disabled) {
        indexes.push(index);
      }
      return indexes;
    }, []);

    const getFallbackIndex = () => {
      if (
        selectedIndex >= 0 &&
        selectedIndex < options.length &&
        !options[selectedIndex].disabled
      ) {
        return selectedIndex;
      }

      return focusableIndexes[0] ?? -1;
    };

    const focusOptionAtIndex = (index: number) => {
      window.requestAnimationFrame(() => {
        optionRefs.current[index]?.focus();
      });
    };

    const openMenu = (nextIndex?: number) => {
      const targetIndex = nextIndex ?? getFallbackIndex();
      setActiveIndex(targetIndex);
      setIsOpen(true);
    };

    const closeMenu = () => {
      setIsOpen(false);
      setActiveIndex(-1);
    };

    const moveActiveIndex = (direction: 1 | -1) => {
      if (focusableIndexes.length === 0) return;

      const currentPosition = focusableIndexes.indexOf(activeIndex);
      const startPosition = currentPosition === -1 ? (direction === 1 ? -1 : 0) : currentPosition;
      const nextPosition =
        (startPosition + direction + focusableIndexes.length) % focusableIndexes.length;
      const nextIndex = focusableIndexes[nextPosition];

      setActiveIndex(nextIndex);
      focusOptionAtIndex(nextIndex);
    };

    const selectIndex = (index: number) => {
      const option = options[index];
      if (!option || option.disabled) return;

      onValueChange(option.value);
      closeMenu();
      window.requestAnimationFrame(() => {
        triggerRef.current?.focus();
      });
    };

    const handleTriggerRef = (node: HTMLButtonElement | null) => {
      triggerRef.current = node;

      if (typeof ref === "function") {
        ref(node);
        return;
      }

      if (ref) {
        ref.current = node;
      }
    };

    React.useEffect(() => {
      if (!isOpen) return;

      const handlePointerDown = (event: PointerEvent) => {
        if (!rootRef.current?.contains(event.target as Node)) {
          closeMenu();
        }
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          closeMenu();
        }
      };

      document.addEventListener("pointerdown", handlePointerDown);
      document.addEventListener("keydown", handleKeyDown);

      return () => {
        document.removeEventListener("pointerdown", handlePointerDown);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }, [isOpen]);

    React.useEffect(() => {
      if (!isOpen || activeIndex < 0) return;
      optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
    }, [activeIndex, isOpen]);

    const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();

        if (!isOpen) {
          openMenu(focusableIndexes[0]);
          return;
        }

        moveActiveIndex(1);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();

        if (!isOpen) {
          openMenu(focusableIndexes[focusableIndexes.length - 1]);
          return;
        }

        moveActiveIndex(-1);
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();

        if (isOpen && activeIndex >= 0) {
          selectIndex(activeIndex);
          return;
        }

        openMenu();
      }
    };

    const handleOptionKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveActiveIndex(1);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveActiveIndex(-1);
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        const firstIndex = focusableIndexes[0] ?? -1;
        if (firstIndex >= 0) {
          setActiveIndex(firstIndex);
          focusOptionAtIndex(firstIndex);
        }
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        const lastIndex = focusableIndexes[focusableIndexes.length - 1] ?? -1;
        if (lastIndex >= 0) {
          setActiveIndex(lastIndex);
          focusOptionAtIndex(lastIndex);
        }
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectIndex(index);
      }
    };

    return (
      <div
        className={joinClasses("relative w-full", className)}
        ref={rootRef}
      >
        {name ? <input type="hidden" name={name} value={value} /> : null}
        <button
          ref={handleTriggerRef}
          id={triggerId}
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          className={joinClasses(
            "flex min-h-10 w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-left text-sm text-slate-900 transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60",
            !selectedOption && "text-slate-400",
            triggerClassName
          )}
          onClick={() => {
            if (disabled) return;
            if (isOpen) {
              closeMenu();
              return;
            }
            openMenu();
          }}
          onKeyDown={handleTriggerKeyDown}
        >
          <span className="truncate">{displayLabel}</span>
          <span
            aria-hidden="true"
            className={joinClasses(
              "material-symbols-outlined text-[20px] text-slate-400 transition-transform",
              isOpen && "rotate-180"
            )}
          >
            expand_more
          </span>
        </button>

        {isOpen ? (
          <div
            id={listboxId}
            role="listbox"
            aria-labelledby={triggerId}
            className={joinClasses(
              "absolute top-full z-40 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg shadow-slate-900/10",
              menuClassName
            )}
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isActive = index === activeIndex;

              return (
                <button
                  key={`${option.value}-${index}`}
                  ref={(node) => {
                    optionRefs.current[index] = node;
                  }}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  className={joinClasses(
                    "flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    option.disabled && "cursor-not-allowed opacity-50",
                    isSelected && "bg-primary/10 text-primary",
                    isActive && !isSelected && "bg-slate-100 text-slate-900",
                    !isSelected && !isActive && "text-slate-700 hover:bg-slate-100",
                    optionClassName
                  )}
                  onClick={() => selectIndex(index)}
                  onMouseEnter={() => setActiveIndex(index)}
                  onKeyDown={(event) => handleOptionKeyDown(event, index)}
                >
                  <span className="truncate">{option.label}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }
);

Select.displayName = "Select";

export { Select };
