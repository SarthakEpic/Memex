import { assertSafePublicHttpUrl } from "@/server/security/url"

export interface WebPageContent {
  ok: boolean
  title: string
  html: string
  publishedTime?: string
  url: string
  error?: string
}

export async function fetchPublicWebPageContent(rawUrl: string): Promise<WebPageContent> {
  try {
    let current = await assertSafePublicHttpUrl(rawUrl)

    for (let redirectCount = 0; redirectCount <= 5; redirectCount++) {
      const response = await fetch(current.href, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Memex/1.0)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      })

      if (isRedirect(response.status)) {
        const location = response.headers.get("location")
        if (!location) {
          return failure(current.href, "Redirect response did not include a Location header")
        }
        current = await assertSafePublicHttpUrl(new URL(location, current).href)
        continue
      }

      if (!response.ok) {
        return failure(current.href, `HTTP ${response.status} ${response.statusText}`)
      }

      const contentType = response.headers.get("content-type") || ""
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
        return failure(current.href, `Unsupported content type: ${contentType}`)
      }

      const html = await response.text()
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
      const title = titleMatch ? titleMatch[1].trim().slice(0, 200) : current.href
      const publishedMatch =
        html.match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+name=["']date["'][^>]+content=["']([^"']+)["']/i)

      return {
        ok: true,
        title,
        html,
        publishedTime: publishedMatch ? publishedMatch[1] : undefined,
        url: current.href,
      }
    }

    return failure(current.href, "Too many redirects")
  } catch (err: unknown) {
    return failure(rawUrl, err instanceof Error ? err.message : String(err))
  }
}

function failure(url: string, error: string): WebPageContent {
  return { ok: false, title: "", html: "", url, error }
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400
}
