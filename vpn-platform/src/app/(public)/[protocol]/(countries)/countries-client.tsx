"use client";

import { useMemo, useState } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { CountryCard } from "@/components/public/country-card";
import { COUNTRY_GRID } from "@/components/public/section";
import { cn } from "@/lib/utils";
import type { PublicCountrySummary } from "@/lib/public/types";

/** Country grid with a name search and region chips (filters shown once there are enough countries). */
export function CountriesGrid({ countries, protocolName }: { countries: PublicCountrySummary[]; protocolName: string }) {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<string | null>(null);
  const regions = useMemo(() => [...new Set(countries.map((c) => c.region).filter((r): r is string => !!r))].sort(), [countries]);
  const q = query.trim().toLowerCase();
  const shown = countries.filter(
    (c) => (!region || c.region === region) && (!q || c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q || c.slug.includes(q)),
  );
  const showFilters = countries.length >= 6 || regions.length > 1;

  return (
    <div>
      {showFilters ? (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block w-full sm:max-w-xs">
            <span className="sr-only">Search countries</span>
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a country"
              maxLength={60}
              className="h-11 w-full rounded-full border border-input bg-card pr-10 pl-10 text-base shadow-xs sm:text-sm transition-[box-shadow,border-color] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <XIcon className="size-4" />
              </button>
            ) : null}
          </label>
          {regions.length > 1 ? (
            <div role="group" aria-label="Filter by region" className="flex flex-wrap gap-2">
              {[null, ...regions].map((r) => (
                <button
                  key={r ?? "all"}
                  type="button"
                  aria-pressed={region === r}
                  onClick={() => setRegion(r)}
                  className={cn(
                    "h-10 rounded-full border px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    region === r ? "border-primary bg-primary text-primary-foreground shadow-sm" : "bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  {r ?? "All regions"}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {shown.length} of {countries.length} countries shown
      </p>

      {shown.length === 0 ? (
        <div className="rounded-3xl border border-dashed bg-card/60 px-6 py-12 text-center">
          <p className="font-medium">No country matches “{query}”.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setRegion(null);
            }}
            className="mt-3 text-sm font-medium text-primary hover:underline"
          >
            Show all countries
          </button>
        </div>
      ) : (
        <div className={COUNTRY_GRID}>
          {shown.map((c, i) => (
            <CountryCard
              key={c.code}
              country={c}
              protocolName={protocolName}
              className="animate-in duration-500 fade-in fill-mode-both slide-in-from-bottom-3"
              style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
