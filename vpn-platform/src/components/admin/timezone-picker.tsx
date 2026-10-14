"use client";

import { useId, useMemo, useRef, useState } from "react";
import { CheckIcon, ChevronsUpDownIcon, GlobeIcon, SearchIcon } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

export interface TimeZoneOption {
  /** IANA name, e.g. "Asia/Bangkok". */
  id: string;
  /** Current offset label computed on the server, e.g. "UTC+07:00". */
  offset: string;
}

const label = (id: string) => id.replace(/_/g, " ");

/**
 * Searchable time zone combobox (type to filter by city, region or offset; arrow keys + Enter).
 * The list comes from Intl.supportedValuesOf("timeZone") on the server so SSR and hydration agree.
 */
export function TimeZonePicker({
  id,
  value,
  options,
  onChange,
  invalid,
  disabled,
}: {
  id?: string;
  value: string;
  options: TimeZoneOption[];
  onChange: (tz: string) => void;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, " ");
    if (!q) return options;
    return options.filter((o) => label(o.id).toLowerCase().includes(q) || o.offset.toLowerCase().includes(q.replace(/^gmt/, "utc")));
  }, [options, query]);

  const selected = options.find((o) => o.id === value);

  function choose(tz: string) {
    onChange(tz);
    setOpen(false);
    setQuery("");
  }

  function move(delta: number) {
    setActive((i) => {
      const next = Math.max(0, Math.min(filtered.length - 1, i + delta));
      listRef.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
      return next;
    });
  }

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setQuery("");
          setActive(Math.max(0, options.findIndex((x) => x.id === value)));
        }
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={cn(
            "flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-card px-3 text-left text-sm shadow-xs transition-[color,box-shadow] outline-none",
            "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50",
            "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
          )}
        >
          <GlobeIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{selected ? label(selected.id) : value || "Choose a time zone"}</span>
          {selected ? <span className="shrink-0 font-mono text-xs text-muted-foreground">{selected.offset}</span> : null}
          <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          className="z-50 w-[var(--radix-popover-trigger-width)] min-w-72 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).querySelector("input")?.focus();
          }}
        >
          <div className="flex items-center gap-2 border-b px-3">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
                listRef.current?.scrollTo({ top: 0 });
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  move(1);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  move(-1);
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const o = filtered[active];
                  if (o) choose(o.id);
                }
              }}
              placeholder="Search city, region or UTC+7"
              aria-label="Search time zones"
              aria-controls={listId}
              aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
              className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div ref={listRef} id={listId} role="listbox" aria-label="Time zones" className="max-h-72 overflow-y-auto overscroll-contain p-1">
            {filtered.map((o, i) => (
              <div
                key={o.id}
                id={`${listId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={o.id === value}
                onPointerMove={() => setActive(i)}
                onClick={() => choose(o.id)}
                className={cn(
                  "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm select-none",
                  i === active && "bg-accent text-accent-foreground",
                )}
              >
                <CheckIcon className={cn("size-3.5 shrink-0", o.id === value ? "text-primary" : "invisible")} />
                <span className="min-w-0 flex-1 truncate">{label(o.id)}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{o.offset}</span>
              </div>
            ))}
            {filtered.length === 0 ? <p className="px-2 py-6 text-center text-sm text-muted-foreground">No time zone matches “{query}”.</p> : null}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
