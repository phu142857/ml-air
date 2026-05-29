"use client"

import { Component, type ReactNode } from "react"
import { AlertTriangle, ServerCrash, FileQuestion, RefreshCw, Home, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ErrorType = "not-found" | "api-down" | "generic"

interface ErrorState {
  hasError: boolean
  error: Error | null
  errorType: ErrorType
}

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onReset?: () => void
}

function getErrorType(error: Error): ErrorType {
  const message = error.message.toLowerCase()
  const status = (error as { status?: number }).status
  
  if (status === 404 || message.includes("404") || message.includes("not found")) {
    return "not-found"
  }
  
  if (
    status === 500 || 
    status === 502 || 
    status === 503 || 
    message.includes("500") || 
    message.includes("api") || 
    message.includes("server") ||
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("econnrefused")
  ) {
    return "api-down"
  }
  
  return "generic"
}

const errorConfig: Record<ErrorType, {
  icon: typeof AlertTriangle
  iconColor: string
  iconBgColor: string
  borderColor: string
  title: string
  description: string
  statusCode: string
}> = {
  "not-found": {
    icon: FileQuestion,
    iconColor: "text-[color:var(--status-pending-fg)]",
    iconBgColor: "bg-[color:var(--status-pending-bg)]",
    borderColor: "border-[color:var(--status-pending-border)]",
    title: "Resource Not Found",
    description: "The requested resource could not be found. It may have been moved, deleted, or the URL might be incorrect.",
    statusCode: "404",
  },
  "api-down": {
    icon: ServerCrash,
    iconColor: "text-[color:var(--status-failed-fg)]",
    iconBgColor: "bg-[color:var(--status-failed-bg)]",
    borderColor: "border-red-500/20",
    title: "Service Unavailable",
    description: "The API service is currently unavailable. This could be due to maintenance or temporary server issues.",
    statusCode: "500",
  },
  "generic": {
    icon: AlertTriangle,
    iconColor: "text-[color:var(--status-failed-fg)]",
    iconBgColor: "bg-[color:var(--status-failed-bg)]",
    borderColor: "border-red-500/20",
    title: "Something Went Wrong",
    description: "An unexpected error occurred. Please try again or contact support if the problem persists.",
    statusCode: "Error",
  },
}

interface ErrorDisplayProps {
  errorType: ErrorType
  error: Error | null
  onRetry?: () => void
  onGoBack?: () => void
  onGoHome?: () => void
  className?: string
}

export function ErrorDisplay({ 
  errorType, 
  error, 
  onRetry, 
  onGoBack, 
  onGoHome,
  className 
}: ErrorDisplayProps) {
  const config = errorConfig[errorType]
  const Icon = config.icon
  
  return (
    <div className={cn(
      "flex flex-col items-center justify-center min-h-[400px] p-8",
      className
    )}>
      <div className="bezel-shell rounded-2xl p-1">
        <div
          className={cn(
            "bezel-inner flex h-20 w-20 items-center justify-center border",
            config.iconBgColor,
            config.borderColor,
          )}
        >
          <Icon strokeWidth={1.75} className={cn("h-10 w-10", config.iconColor)} />
        </div>
      </div>
      
      {/* Status code badge */}
      <div className={cn(
        "mt-6 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono border",
        config.iconBgColor,
        config.borderColor,
        config.iconColor
      )}>
        <span className="uppercase tracking-wider">Status</span>
        <span className="font-bold">{config.statusCode}</span>
      </div>
      
      {/* Error message */}
      <h2 className="mt-4 text-xl font-semibold text-foreground">
        {config.title}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground text-center max-w-md">
        {config.description}
      </p>
      
      {/* Error details (collapsible) */}
      {error && (
        <details className="mt-4 w-full max-w-md">
          <summary className="cursor-pointer text-xs text-muted-foreground/80 hover:text-muted-foreground transition-colors">
            Show technical details
          </summary>
          <div className="mt-2 overflow-x-auto rounded-xl border border-border/60 bg-muted/30 p-3">
            <code className="text-xs font-mono text-muted-foreground break-all">
              {error.message}
            </code>
            {error.stack && (
              <pre className="mt-2 text-[10px] font-mono text-muted-foreground whitespace-pre-wrap">
                {error.stack.split("\n").slice(1, 5).join("\n")}
              </pre>
            )}
          </div>
        </details>
      )}
      
      {/* Action buttons */}
      <div className="mt-6 flex items-center gap-3">
        {onGoBack && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onGoBack}
            className="h-9 gap-2 bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </Button>
        )}
        {onGoHome && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onGoHome}
            className="h-9 gap-2 bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <Home className="h-4 w-4" />
            Home
          </Button>
        )}
        {onRetry && (
          <Button 
            size="sm"
            onClick={onRetry}
            className={cn(
              "h-9 gap-2",
              errorType === "not-found" 
                ? "bg-primary hover:bg-primary/90 text-white"
                : "bg-red-600 hover:bg-red-500 text-white"
            )}
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
        )}
      </div>
      
      {/* Helpful links for API down */}
      {errorType === "api-down" && (
        <div className="mt-8 w-full max-w-md rounded-xl bezel-shell border-border/60 p-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Troubleshooting
          </h3>
          <ul className="mt-3 space-y-2">
            <li className="flex items-start gap-2 text-xs text-muted-foreground">
              <span className="text-muted-foreground/80">1.</span>
              Check if the <code className="text-muted-foreground bg-muted px-1 rounded">/v1</code> proxy endpoint is running
            </li>
            <li className="flex items-start gap-2 text-xs text-muted-foreground">
              <span className="text-muted-foreground/80">2.</span>
              Verify your network connection
            </li>
            <li className="flex items-start gap-2 text-xs text-muted-foreground">
              <span className="text-muted-foreground/80">3.</span>
              Check the Jaeger service status
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, errorType: "generic" }
  }

  static getDerivedStateFromError(error: Error): ErrorState {
    return { 
      hasError: true, 
      error, 
      errorType: getErrorType(error) 
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[v0] ErrorBoundary caught an error:", error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorType: "generic" })
    this.props.onReset?.()
  }

  handleGoBack = () => {
    window.history.back()
  }

  handleGoHome = () => {
    window.location.href = "/"
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      
      return (
        <ErrorDisplay
          errorType={this.state.errorType}
          error={this.state.error}
          onRetry={this.handleRetry}
          onGoBack={this.handleGoBack}
          onGoHome={this.handleGoHome}
        />
      )
    }

    return this.props.children
  }
}

// Standalone error pages for use with Next.js error.tsx or not-found.tsx
export function NotFoundError({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorDisplay
      errorType="not-found"
      error={null}
      onRetry={onRetry}
      onGoBack={() => window.history.back()}
      onGoHome={() => window.location.href = "/"}
    />
  )
}

export function ApiDownError({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorDisplay
      errorType="api-down"
      error={null}
      onRetry={onRetry}
      onGoBack={() => window.history.back()}
      onGoHome={() => window.location.href = "/"}
    />
  )
}
