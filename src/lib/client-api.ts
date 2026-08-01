"use client"

interface ApiErrorBody {
  error?: string
  message?: string
}

export class ApiRequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiRequestError"
    this.status = status
  }
}

export async function apiRequest<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  let response: Response

  try {
    response = await fetch(input, init)
  } catch {
    throw new ApiRequestError(
      "Could not reach Memex. Check your connection and try again.",
      0
    )
  }

  const body = await parseResponseBody(response)

  if (!response.ok) {
    const errorBody = body as ApiErrorBody | null
    const message =
      errorBody?.error ||
      errorBody?.message ||
      `Request failed with status ${response.status}.`

    if (response.status === 401 && window.location.pathname !== "/login") {
      window.location.replace("/login")
    }

    throw new ApiRequestError(message, response.status)
  }

  return body as T
}

export function getErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  return error instanceof Error && error.message ? error.message : fallback
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined

  const contentType = response.headers.get("content-type") || ""
  if (contentType.includes("application/json")) {
    return response.json().catch(() => null)
  }

  const text = await response.text().catch(() => "")
  return text ? { message: text } : null
}
