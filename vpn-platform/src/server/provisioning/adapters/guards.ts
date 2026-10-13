import { z } from "zod";

/**
 * Hard input constraints. Values typed by anonymous users may eventually reach a shell script on
 * the VPN server, so we only allow a conservative character set — no quotes, spaces, `$`, `` ` ``,
 * `;`, `&`, `|`, `<`, `>`, `\`, `(`, `)` or control characters — whatever the admin configures.
 */
export const RESERVED_USERNAMES = new Set([
  "root", "admin", "administrator", "daemon", "bin", "sys", "sync", "games", "man", "lp", "mail", "news",
  "uucp", "proxy", "www-data", "www", "backup", "list", "irc", "gnats", "nobody", "nogroup", "sshd",
  "systemd-network", "systemd-resolve", "systemd-timesync", "messagebus", "syslog", "ubuntu", "debian",
  "centos", "ec2-user", "user", "guest", "test", "postgres", "mysql", "redis", "nginx", "apache", "xray",
  "v2ray", "trojan", "openvpn", "wireguard", "dropbear", "stunnel", "stunnel4", "squid", "haproxy", "operator",
  "support", "staff", "_apt", "tss", "uuidd", "tcpdump", "landscape", "pollinate", "lxd", "dnsmasq", "ntp",
]);

const notReserved = (u: string) => !RESERVED_USERNAMES.has(u.toLowerCase()) && !u.toLowerCase().startsWith("systemd");

/** Linux account name (SSH, OpenVPN, NoobzVPN, UDP Custom, SlowDNS). Lower-cased automatically. */
export const linuxUsernameGuard = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9_]{2,31}$/, "Use 3–32 characters: lowercase letters, digits or _ and start with a letter.")
  .refine(notReserved, "This username is reserved. Please choose another one.");

/** Display name / "email" used by Xray-family protocols. */
export const remarkGuard = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{2,31}$/, "Use 3–32 characters: letters, digits, _ . or - and start with a letter or digit.")
  .refine(notReserved, "This name is reserved. Please choose another one.");

export const passwordGuard = z
  .string()
  .regex(
    /^[A-Za-z0-9@#%^*_+=.,:~-]{6,32}$/,
    "Use 6–32 characters: letters, digits and @ # % ^ * _ + = . , : ~ - (no spaces or quotes).",
  );

export const transportGuard = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]{2,16}$/, "Invalid transport.");

/** Generic option value (for future protocols using the generic adapter). */
export const optionGuard = z
  .string()
  .trim()
  .max(128)
  .regex(/^[A-Za-z0-9@#%^*_+=.,:~\/-]*$/, "Contains characters that are not allowed.");
