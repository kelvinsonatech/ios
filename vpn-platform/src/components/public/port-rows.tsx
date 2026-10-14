import { CableIcon, GlobeIcon, LockIcon, RadarIcon, TerminalIcon, ZapIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PortMap } from "@/lib/public/types";

/**
 * Human labels for the port keys nodes report (docs/10-script-api-prompt.md §7–8), in display
 * order. Unknown keys are still shown, with a tidied-up version of the key as label.
 */
const PORT_KEYS: Record<string, { label: string; icon: LucideIcon }> = {
  openssh: { label: "SSH", icon: TerminalIcon },
  ssh: { label: "SSH", icon: TerminalIcon },
  dropbear: { label: "Dropbear", icon: TerminalIcon },
  ssl: { label: "SSL", icon: LockIcon },
  stunnel: { label: "SSL", icon: LockIcon },
  tls: { label: "TLS", icon: LockIcon },
  ws_tls: { label: "WS TLS", icon: LockIcon },
  wss: { label: "WS TLS", icon: LockIcon },
  https: { label: "HTTPS", icon: LockIcon },
  none: { label: "Non-TLS", icon: GlobeIcon },
  ntls: { label: "Non-TLS", icon: GlobeIcon },
  non_tls: { label: "Non-TLS", icon: GlobeIcon },
  ws: { label: "WS", icon: GlobeIcon },
  websocket: { label: "WS", icon: GlobeIcon },
  http: { label: "HTTP", icon: GlobeIcon },
  grpc: { label: "gRPC", icon: CableIcon },
  slowdns: { label: "DNS", icon: RadarIcon },
  dns: { label: "DNS", icon: RadarIcon },
  udp: { label: "UDP", icon: ZapIcon },
  udp_custom: { label: "UDP", icon: ZapIcon },
  hysteria: { label: "UDP", icon: ZapIcon },
  hysteria2: { label: "UDP", icon: ZapIcon },
  quic: { label: "QUIC", icon: ZapIcon },
  udpgw: { label: "UDPGW", icon: ZapIcon },
  badvpn: { label: "BadVPN", icon: ZapIcon },
  tcp: { label: "TCP", icon: CableIcon },
  ovpn_tcp: { label: "OpenVPN TCP", icon: CableIcon },
  ovpn_udp: { label: "OpenVPN UDP", icon: ZapIcon },
  ovpn_ssl: { label: "OpenVPN SSL", icon: LockIcon },
  squid: { label: "Squid proxy", icon: CableIcon },
  proxy: { label: "Proxy", icon: CableIcon },
};
const ORDER = Object.keys(PORT_KEYS);

const TRANSPORT_LABELS: Record<string, string> = {
  ws: "WebSocket",
  websocket: "WebSocket",
  grpc: "gRPC",
  tcp: "TCP",
  udp: "UDP",
  httpupgrade: "HTTPUpgrade",
  xhttp: "XHTTP",
  splithttp: "SplitHTTP",
  h2: "HTTP/2",
  http: "HTTP",
  quic: "QUIC",
  kcp: "mKCP",
  reality: "REALITY",
};

/** "ws" → "WebSocket"; unknown transports are shown upper-cased. */
export function transportLabel(t: string): string {
  return TRANSPORT_LABELS[t.toLowerCase()] ?? t.toUpperCase().slice(0, 24);
}

export interface PortRow {
  key: string;
  label: string;
  value: string;
  icon: LucideIcon;
}

function tidyKey(key: string): string {
  const words = key.replace(/[_-]+/g, " ").trim();
  if (words.length <= 4) return words.toUpperCase();
  return words.replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(v: number[] | string): string {
  if (Array.isArray(v)) return v.filter((n) => Number.isFinite(n)).join(", ");
  return String(v).slice(0, 40);
}

/** Port map → labelled rows ("SSH 22", "Dropbear 109, 143", "UDP 6000-19999"), known keys first. */
export function describePorts(ports: PortMap | null | undefined): PortRow[] {
  if (!ports) return [];
  return Object.entries(ports)
    .filter(([, v]) => (Array.isArray(v) ? v.length > 0 : String(v).trim() !== ""))
    .sort(([a], [b]) => {
      const ia = ORDER.indexOf(a.toLowerCase());
      const ib = ORDER.indexOf(b.toLowerCase());
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b);
    })
    .map(([key, v]) => {
      const known = PORT_KEYS[key.toLowerCase()];
      return { key, label: known?.label ?? tidyKey(key), value: formatValue(v), icon: known?.icon ?? CableIcon };
    })
    .filter((r) => r.value !== "");
}

/**
 * Ports as compact label/value chips ("TLS 443"). `variant="rows"` renders one labelled row per key
 * for detail cards. Values use the mono font so port lists line up.
 */
export function PortRows({ ports, variant = "chips", className, max }: { ports: PortMap | null | undefined; variant?: "chips" | "rows"; className?: string; max?: number }) {
  const rows = describePorts(ports);
  if (rows.length === 0) return <span className={cn("text-sm text-muted-foreground", className)}>Shown with your account</span>;
  const shown = max ? rows.slice(0, max) : rows;
  const hidden = rows.length - shown.length;

  if (variant === "rows") {
    return (
      <dl className={cn("divide-y divide-border/70 text-sm", className)}>
        {shown.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-3 py-1.5">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <r.icon className="size-3.5" aria-hidden />
              {r.label}
            </dt>
            <dd className="min-w-0 truncate text-right font-mono text-[0.8rem] font-medium" title={r.value}>
              {r.value}
            </dd>
          </div>
        ))}
        {hidden > 0 ? <div className="pt-1.5 text-xs text-muted-foreground">+{hidden} more</div> : null}
      </dl>
    );
  }

  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {shown.map((r) => (
        <li key={r.key} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border bg-muted/50 px-2 py-1 text-xs">
          <span className="font-medium text-muted-foreground">{r.label}</span>
          <span className="truncate font-mono font-semibold text-foreground" title={r.value}>
            {r.value}
          </span>
        </li>
      ))}
      {hidden > 0 ? <li className="inline-flex items-center rounded-lg px-1.5 py-1 text-xs text-muted-foreground">+{hidden} more</li> : null}
    </ul>
  );
}
