"use client";

import { useId, useState } from "react";
import { ChevronDownIcon, DicesIcon, EyeIcon, EyeOffIcon, SlidersHorizontalIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import type { PublicFormField, PublicProtocolDetail } from "@/lib/public/types";
import { generatePassword, isAdvancedField, normalizeInput } from "./form-validation";

/**
 * Dynamic account form fields rendered from the protocol's field definitions (admin-editable):
 * text, password (show/hide + generator), select (segmented when short), number and duration
 * (segmented). Fields whose key starts with "sni_" go into a collapsible "Advanced" section.
 */

export const fieldId = (key: string) => `f-${key}`;

/** Friendly copy for the VMess/VLESS/Trojan "bug host" mode choice. */
const SNI_TYPE_COPY: Record<string, { title: string; body: string }> = {
  sni: { title: "Use as SNI / host", body: "Your bug host goes into the SNI and Host header; the address stays our server." },
  host: { title: "Use as SNI / host", body: "Your bug host goes into the SNI and Host header; the address stays our server." },
  address: { title: "Use as address", body: "Connect to your bug host as the address; SNI and Host stay our server's domain." },
};

function FieldShell({
  field,
  error,
  children,
  asFieldset,
  labelSuffix,
}: {
  field: PublicFormField;
  error?: string;
  children: React.ReactNode;
  asFieldset?: boolean;
  labelSuffix?: React.ReactNode;
}) {
  const id = fieldId(field.key);
  const label = (
    <>
      {field.label}
      {field.required ? (
        <span className="text-destructive" aria-hidden>
          *
        </span>
      ) : (
        <span className="text-xs font-normal text-muted-foreground">(optional)</span>
      )}
      {field.required ? <span className="sr-only">(required)</span> : null}
    </>
  );
  const help = field.helpText ? (
    <p id={`${id}-help`} className="text-xs text-muted-foreground">
      {field.helpText}
    </p>
  ) : null;
  const err = error ? (
    <p id={`${id}-error`} className="text-xs font-medium text-destructive animate-in fade-in-0 motion-reduce:animate-none">
      {error}
    </p>
  ) : null;

  if (asFieldset) {
    return (
      <fieldset className="grid gap-2" aria-describedby={[field.helpText ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined}>
        <legend className="mb-2 flex items-center gap-1.5 text-sm font-medium">{label}</legend>
        {children}
        {help}
        {err}
      </fieldset>
    );
  }
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="flex items-center gap-1.5 text-sm font-medium">
          {label}
        </label>
        {labelSuffix}
      </div>
      {children}
      {help}
      {err}
    </div>
  );
}

function describedBy(field: PublicFormField, error?: string) {
  const id = fieldId(field.key);
  return [field.helpText ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
}

/** Native radios styled as a segmented control (arrow keys move between options). */
function Segmented({
  name,
  options,
  value,
  onChange,
  disabled,
  invalid,
}: {
  name: string;
  options: { value: string; label: string; hint?: string }[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  // Up to four choices share one row even on 360 px phones; longer lists wrap.
  const columns = options.length <= 4 ? `repeat(${options.length}, minmax(0, 1fr))` : undefined;
  return (
    <div
      className={cn(
        "grid grid-cols-[repeat(auto-fit,minmax(5rem,1fr))] gap-1 rounded-xl border bg-muted/60 p-1",
        invalid && "border-destructive",
      )}
      style={columns ? { gridTemplateColumns: columns } : undefined}
    >
      {options.map((o) => (
        <label key={o.value} className={cn("relative", disabled && "cursor-not-allowed opacity-60")}>
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            disabled={disabled}
            className="peer sr-only"
          />
          <span className="flex min-h-10 cursor-pointer flex-col items-center justify-center rounded-lg px-1 py-1.5 text-center text-[13px] font-medium whitespace-nowrap sm:px-2 sm:text-sm text-muted-foreground transition-[background-color,color,box-shadow] peer-checked:bg-card peer-checked:text-foreground peer-checked:shadow-sm peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50 hover:text-foreground motion-reduce:transition-none">
            <span className="tabular-nums">{o.label}</span>
            {o.hint ? <span className="text-[11px] font-normal text-muted-foreground">{o.hint}</span> : null}
          </span>
        </label>
      ))}
    </div>
  );
}

/** Radio cards with a title and explanation (used for the SNI mode). */
function RadioCards({
  name,
  options,
  value,
  onChange,
  disabled,
}: {
  name: string;
  options: { value: string; title: string; body?: string }[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((o) => (
        <label key={o.value} className={cn("relative block", disabled && "cursor-not-allowed opacity-60")}>
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            disabled={disabled}
            className="peer sr-only"
          />
          <span className="flex h-full cursor-pointer flex-col gap-1 rounded-xl border bg-card p-3 transition-[border-color,box-shadow,background-color] peer-checked:border-primary peer-checked:bg-accent/50 peer-checked:shadow-[0_0_0_1px_var(--primary)] peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50 hover:border-primary/40 motion-reduce:transition-none">
            <span className="text-sm font-medium">{o.title}</span>
            {o.body ? <span className="text-xs text-muted-foreground">{o.body}</span> : null}
          </span>
        </label>
      ))}
    </div>
  );
}

function PasswordInput({
  field,
  value,
  onChange,
  onBlur,
  error,
  disabled,
}: {
  field: PublicFormField;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  error?: string;
  disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <FieldShell
      field={field}
      error={error}
      labelSuffix={
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onChange(generatePassword(field));
            setVisible(true);
          }}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-primary transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
        >
          <DicesIcon className="size-3.5" aria-hidden />
          Generate strong password
        </button>
      }
    >
      <div className="relative">
        <Input
          id={fieldId(field.key)}
          name={field.key}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={field.placeholder ?? undefined}
          required={field.required}
          minLength={field.validation.minLength}
          maxLength={field.validation.maxLength}
          autoComplete="new-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
          aria-invalid={!!error || undefined}
          aria-describedby={describedBy(field, error)}
          className="h-11 pr-11 font-mono text-base sm:text-sm"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
        </button>
      </div>
    </FieldShell>
  );
}

function FieldControl({
  field,
  protocol,
  value,
  error,
  disabled,
  onChange,
  onBlur,
}: {
  field: PublicFormField;
  protocol: PublicProtocolDetail;
  value: string;
  error?: string;
  disabled?: boolean;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  const id = fieldId(field.key);
  if (field.type === "password") {
    return <PasswordInput field={field} value={value} onChange={onChange} onBlur={onBlur} error={error} disabled={disabled} />;
  }
  if (field.type === "duration") {
    return (
      <FieldShell field={{ ...field, label: field.label || "Validity" }} error={error} asFieldset>
        <Segmented
          name={field.key}
          value={value}
          onChange={onChange}
          disabled={disabled}
          invalid={!!error}
          options={protocol.durationOptions.map((d) => ({ value: String(d), label: `${d} ${d === 1 ? "day" : "days"}` }))}
        />
      </FieldShell>
    );
  }
  if (field.type === "select") {
    if (field.key === "sni_type") {
      return (
        <FieldShell field={field} error={error} asFieldset>
          <RadioCards
            name={field.key}
            value={value}
            onChange={onChange}
            disabled={disabled}
            options={field.options.map((o) => ({
              value: o.value,
              title: SNI_TYPE_COPY[o.value]?.title ?? o.label,
              body: SNI_TYPE_COPY[o.value]?.body,
            }))}
          />
        </FieldShell>
      );
    }
    if (field.options.length > 0 && field.options.length <= 3 && field.options.every((o) => o.label.length <= 14)) {
      const opts = field.required ? field.options : [{ value: "", label: "None" }, ...field.options];
      return (
        <FieldShell field={field} error={error} asFieldset>
          <Segmented name={field.key} value={value} onChange={onChange} disabled={disabled} invalid={!!error} options={opts} />
        </FieldShell>
      );
    }
    return (
      <FieldShell field={field} error={error}>
        <NativeSelect
          id={id}
          name={field.key}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          aria-invalid={!!error || undefined}
          aria-describedby={describedBy(field, error)}
          className="h-11"
        >
          {field.required ? null : <option value="">None</option>}
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      </FieldShell>
    );
  }
  const isUser = field.key === "username";
  return (
    <FieldShell field={field} error={error}>
      <Input
        id={id}
        name={field.key}
        type="text"
        inputMode={field.type === "number" ? "numeric" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={field.placeholder ?? undefined}
        required={field.required}
        maxLength={field.type === "number" ? 12 : Math.min(field.validation.maxLength ?? 128, 128)}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        disabled={disabled}
        aria-invalid={!!error || undefined}
        aria-describedby={describedBy(field, error)}
        className={cn("h-11 text-base sm:text-sm", (isUser || field.key === "sni_bug") && "font-mono")}
      />
    </FieldShell>
  );
}

export function AccountFormFields({
  protocol,
  values,
  errors,
  disabled,
  onChange,
  onBlur,
}: {
  protocol: PublicProtocolDetail;
  values: Record<string, string>;
  errors: Record<string, string | undefined>;
  disabled?: boolean;
  onChange: (key: string, value: string) => void;
  onBlur: (key: string) => void;
}) {
  const advancedId = useId();
  const main = protocol.fields.filter((f) => !isAdvancedField(f));
  const advanced = protocol.fields.filter(isAdvancedField);
  // Opens by itself when one of its fields has a problem, so errors are never hidden.
  const advancedHasError = advanced.some((f) => !!errors[f.key]);
  const [open, setOpen] = useState(false);
  const expanded = open || advancedHasError;

  const render = (f: PublicFormField) => (
    <FieldControl
      key={f.key}
      field={f}
      protocol={protocol}
      value={values[f.key] ?? ""}
      error={errors[f.key]}
      disabled={disabled}
      onChange={(v) => onChange(f.key, normalizeInput(f, v))}
      onBlur={() => onBlur(f.key)}
    />
  );

  return (
    <div className="grid gap-5">
      {main.map(render)}
      {advanced.length ? (
        <div className="rounded-xl border bg-muted/30">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={advancedId}
            onClick={() => setOpen(!expanded)}
            className="flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-left text-sm font-medium focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <SlidersHorizontalIcon className="size-4 text-muted-foreground" aria-hidden />
            <span className="flex-1">
              Advanced: SNI / bug host
              <span className="block text-xs font-normal text-muted-foreground">Optional. Only needed for custom bug hosts.</span>
            </span>
            <ChevronDownIcon className={cn("size-4 text-muted-foreground transition-transform motion-reduce:transition-none", expanded && "rotate-180")} aria-hidden />
          </button>
          <div id={advancedId} hidden={!expanded} className="grid gap-5 border-t px-4 pt-4 pb-5">
            {advanced.map(render)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
