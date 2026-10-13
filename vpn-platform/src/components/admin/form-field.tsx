import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function FormField({
  id,
  label,
  hint,
  errors,
  className,
  children,
  optional,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  errors?: string[];
  className?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {optional ? <span className="text-xs font-normal text-muted-foreground">(optional)</span> : null}
      </Label>
      {children}
      {errors?.length ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {errors[0]}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
