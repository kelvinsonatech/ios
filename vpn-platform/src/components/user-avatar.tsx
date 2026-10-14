import { cn } from "@/lib/utils";

/**
 * Renders a DiceBear avatar produced on the server by `avatarDataUri()` (src/server/avatar.ts).
 * Pass the data URI in; this component never generates avatars itself so it stays client-safe.
 */
export function UserAvatar({ src, size = 32, className, alt = "" }: { src: string; size?: number; className?: string; alt?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- data: URI, nothing to optimise
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      draggable={false}
      className={cn("shrink-0 rounded-full bg-muted ring-1 ring-border", className)}
      style={{ width: size, height: size }}
    />
  );
}
