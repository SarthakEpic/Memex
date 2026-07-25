import dns from "node:dns/promises"
import net from "node:net"

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
])

export async function assertSafePublicHttpUrl(rawUrl: string): Promise<URL> {
  const parsed = new URL(rawUrl)
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http(s) URLs are supported")
  }

  const hostname = parsed.hostname.toLowerCase()
  if (isBlockedHostname(hostname)) {
    throw new Error("Private, local, and metadata URLs cannot be imported")
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error("Private, local, and metadata URLs cannot be imported")
    }
    return parsed
  }

  const records = await dns.lookup(hostname, { all: true, verbatim: true })
  if (records.length === 0 || records.some((record) => isPrivateIp(record.address))) {
    throw new Error("URL resolves to a private or local network address")
  }

  return parsed
}

export function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "")
  return (
    BLOCKED_HOSTNAMES.has(normalized) ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  )
}

export function isPrivateIp(address: string): boolean {
  if (net.isIPv4(address)) return isPrivateIpv4(address)
  if (net.isIPv6(address)) return isPrivateIpv6(address)
  return true
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number)
  const [a, b] = parts

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 88 && parts[2] === 99) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase()
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.") ||
    /^::ffff:172\.(1[6-9]|2\d|3[0-1])\./.test(normalized) ||
    normalized.startsWith("::ffff:169.254.")
  )
}
