import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  variant?: "spinner" | "skeleton";
}

export function LoadingSpinner({ size = "md", className = "", variant = "spinner" }: LoadingSpinnerProps) {
  if (variant === "skeleton") {
    return (
      <div className={`space-y-2 ${className}`}>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[90%]" />
        <Skeleton className="h-4 w-[80%]" />
      </div>
    );
  }

  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-12 w-12",
    lg: "h-16 w-16",
  };

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <Loader2 className={`animate-spin text-ctp-mauve ${sizeClasses[size]}`} />
    </div>
  );
}

export default LoadingSpinner;

