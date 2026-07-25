import crypto from "node:crypto"

const PREFIX = "enc:v1"
const IV_BYTES = 12
const AUTH_TAG_BYTES = 16

export function encryptSecret(plainText: string): string {
  if (!plainText) return ""

  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv, {
    authTagLength: AUTH_TAG_BYTES,
  })
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  return [
    PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":")
}

export function decryptSecret(value: string): string {
  if (!value) return ""
  if (!value.startsWith(`${PREFIX}:`)) return value

  const [, , ivBase64, tagBase64, encryptedBase64] = value.split(":")
  if (!ivBase64 || !tagBase64 || !encryptedBase64) {
    throw new Error("Invalid encrypted secret format")
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivBase64, "base64url"),
    { authTagLength: AUTH_TAG_BYTES }
  )
  decipher.setAuthTag(Buffer.from(tagBase64, "base64url"))

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(`${PREFIX}:`)
}

function getKey(): Buffer {
  const configured = process.env.ENCRYPTION_KEY
  if (configured) return crypto.createHash("sha256").update(configured).digest()

  if (process.env.NODE_ENV === "production") {
    throw new Error("ENCRYPTION_KEY is required in production")
  }

  return crypto
    .createHash("sha256")
    .update("memex-development-only-encryption-key")
    .digest()
}
