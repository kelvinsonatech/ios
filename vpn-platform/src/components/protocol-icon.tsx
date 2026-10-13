import {
  CableIcon,
  CloudIcon,
  EyeOffIcon,
  GlobeIcon,
  KeyRoundIcon,
  LockIcon,
  NetworkIcon,
  RadarIcon,
  RadioIcon,
  RocketIcon,
  RouteIcon,
  SatelliteIcon,
  ServerIcon,
  ShieldCheckIcon,
  ShieldIcon,
  SwordsIcon,
  TerminalIcon,
  WaypointsIcon,
  WifiIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import type { ProtocolIconName } from "@/lib/protocol-icons";

const MAP: Record<ProtocolIconName, LucideIcon> = {
  terminal: TerminalIcon,
  lock: LockIcon,
  globe: GlobeIcon,
  radar: RadarIcon,
  zap: ZapIcon,
  shield: ShieldIcon,
  "shield-check": ShieldCheckIcon,
  "eye-off": EyeOffIcon,
  waypoints: WaypointsIcon,
  route: RouteIcon,
  swords: SwordsIcon,
  rocket: RocketIcon,
  network: NetworkIcon,
  "key-round": KeyRoundIcon,
  wifi: WifiIcon,
  cloud: CloudIcon,
  radio: RadioIcon,
  cable: CableIcon,
  satellite: SatelliteIcon,
  server: ServerIcon,
};

export function ProtocolIcon({ name, className }: { name: string; className?: string }) {
  const Icon = MAP[name as ProtocolIconName] ?? ShieldIcon;
  return <Icon className={className} aria-hidden="true" />;
}
