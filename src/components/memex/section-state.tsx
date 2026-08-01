import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export function SectionError({
  title,
  error,
  onRetry,
}: {
  title: string
  error: unknown
  onRetry: () => void
}) {
  const message =
    error instanceof Error
      ? error.message
      : "Something went wrong while loading this section."

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-sm space-y-3 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-destructive/10 text-destructive">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {message}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Try again
        </Button>
      </div>
    </div>
  )
}
