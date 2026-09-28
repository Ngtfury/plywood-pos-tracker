import React from "react";

export type IosSpinnerSize = "xs" | "sm" | "md" | "lg" | "xl";

interface IosSpinnerProps {
  size?: IosSpinnerSize | number;
  className?: string;
  label?: string;
  labelPlacement?: "right" | "bottom";
  labelClassName?: string;
}

const SIZE_MAP: Record<IosSpinnerSize, number> = {
  xs: 14,
  sm: 18,
  md: 24,
  lg: 32,
  xl: 44,
};

export const IosSpinner: React.FC<IosSpinnerProps> = ({
  size = "md",
  className = "",
  label,
  labelPlacement = "right",
  labelClassName = "text-xs text-muted-foreground",
}) => {
  const pixelSize = typeof size === "number" ? size : SIZE_MAP[size] || 24;

  const blades = Array.from({ length: 12 }, (_, i) => {
    const angle = i * 30;
    const delay = ((i - 12) * 0.08333).toFixed(4);

    return (
      <span
        key={i}
        className="ios-spinner-blade"
        style={{
          transform: `rotate(${angle}deg)`,
          animationDelay: `${delay}s`,
        }}
      />
    );
  });

  const spinnerElement = (
    <span
      className={`ios-spinner shrink-0 ${className}`}
      style={{
        width: `${pixelSize}px`,
        height: `${pixelSize}px`,
      }}
      role="status"
      aria-label={label || "Loading"}
    >
      {blades}
    </span>
  );

  if (!label) {
    return spinnerElement;
  }

  if (labelPlacement === "bottom") {
    return (
      <div className="flex flex-col items-center justify-center gap-2">
        {spinnerElement}
        <span className={labelClassName}>{label}</span>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2">
      {spinnerElement}
      <span className={labelClassName}>{label}</span>
    </div>
  );
};

/**
 * Standard iOS-style loading container for dashboard widgets, tables, and views.
 */
export const IosLoadingView: React.FC<{
  text?: string;
  minHeight?: string | number;
  size?: IosSpinnerSize | number;
  className?: string;
}> = ({
  text = "Loading data...",
  minHeight = "200px",
  size = "lg",
  className = "",
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-muted-foreground gap-3 py-8 ${className}`}
      style={{ minHeight }}
    >
      <IosSpinner size={size} label={text} labelPlacement="bottom" labelClassName="text-sm font-medium tracking-tight text-muted-foreground/80 animate-pulse" />
    </div>
  );
};

/**
 * Subtle overlay that appears during lagging operations or quick database queries.
 */
export const IosLoadingOverlay: React.FC<{
  text?: string;
  className?: string;
}> = ({ text = "Updating...", className = "" }) => {
  return (
    <div
      className={`absolute inset-0 bg-background/50 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center gap-2 transition-all ${className}`}
    >
      <IosSpinner size="md" className="text-primary" />
      {text && (
        <span className="text-xs font-medium text-foreground bg-background/90 px-2.5 py-1 rounded-full shadow border">
          {text}
        </span>
      )}
    </div>
  );
};
