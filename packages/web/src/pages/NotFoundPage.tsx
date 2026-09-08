import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import "./NotFoundPage.css";

export function NotFoundPage() {
  return (
    <main className="not-found-page">
      <div className="not-found-page__content">
        <p className="not-found-page__code">404</p>
        <h1>页面不存在</h1>
        <p className="not-found-page__description">返回消息页，继续查看监听到的内容。</p>
        <Button nativeButton={false} size="lg" render={<Link to="/messages" />}>
          返回消息页
        </Button>
      </div>
    </main>
  );
}
