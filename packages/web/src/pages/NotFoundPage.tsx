import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="max-w-md space-y-4 text-center">
        <p className="text-5xl font-semibold tracking-tight">404</p>
        <p className="text-sm text-muted-foreground">页面不存在，返回消息页继续查看追踪内容。</p>
        <Link
          to="/messages"
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
        >
          返回消息页
        </Link>
      </div>
    </div>
  );
}
