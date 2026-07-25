type LogLevel = "info" | "warn" | "error"

type LogFields = Record<string, unknown>

export function logInfo(event: string, fields: LogFields = {}): void {
  writeLog("info", event, fields)
}

export function logWarn(event: string, fields: LogFields = {}): void {
  writeLog("warn", event, fields)
}

export function logError(event: string, fields: LogFields = {}): void {
  writeLog("error", event, fields)
}

function writeLog(level: LogLevel, event: string, fields: LogFields): void {
  const payload = {
    level,
    event,
    at: new Date().toISOString(),
    ...fields,
  }

  const line = process.env.NODE_ENV === "production" ? JSON.stringify(payload) : payload
  if (level === "error") {
    console.error(line)
  } else if (level === "warn") {
    console.warn(line)
  } else {
    console.info(line)
  }
}
