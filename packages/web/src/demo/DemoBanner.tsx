import { Button } from "@/components/ui/button";
import "./DemoBanner.css";

export function DemoBanner() {
  return (
    <aside className="demo-banner" aria-label="演示模式">
      <div>
        <strong>交互 Demo · 虚构数据</strong>
        <span>修改仅保留到刷新，不连接 Telegram</span>
      </div>
      <div className="demo-banner__actions">
        <a href="https://github.com/yjrhgvbn/telegram-star/blob/main/docs/user-guide.md" target="_blank" rel="noreferrer">使用教程</a>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>重置演示</Button>
      </div>
    </aside>
  );
}
