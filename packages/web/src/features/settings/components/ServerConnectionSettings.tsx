import { Collapsible } from "@base-ui/react/collapsible";
import { Field } from "@base-ui/react/field";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { AlertCircle, CheckCircle2, ChevronDown, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { useServerConnectionSettings } from "../hooks/useServerConnectionSettings";
import "./ServerConnectionSettings.css";

type ServerConnectionSettingsState = ReturnType<typeof useServerConnectionSettings>;

export function ServerConnectionSettings({
  settings,
}: {
  settings: ServerConnectionSettingsState;
}) {
  const custom = settings.connectionMode === "custom";
  const telegram = settings.health?.telegram;
  const telegramStatus = !telegram?.configured
    ? "未配置"
    : !telegram.authorized
      ? "未登录"
      : telegram.connected
        ? "已连接"
        : "未连接";

  return (
    <section className="server-connection-settings" aria-label="服务器连接设置">
      <div className="server-connection-label-row">
        <h2 id="connection-mode-label">连接方式</h2>
        <span>仅当前客户端</span>
      </div>
      <ToggleGroup
        aria-labelledby="connection-mode-label"
        className="server-connection-mode"
        value={[settings.connectionMode]}
        onValueChange={(values) => {
          const mode = values[0];
          if (mode === "same" || mode === "custom") settings.setConnectionMode(mode);
        }}
      >
        <Toggle value="same">使用当前站点</Toggle>
        <Toggle value="custom">自定义地址</Toggle>
      </ToggleGroup>

      <Field.Root className="server-connection-field" invalid={Boolean(settings.inputError)}>
        <Field.Label htmlFor="server-url">
          {custom ? "服务器地址" : "当前站点"}
        </Field.Label>
        <div className="server-connection-address-row">
          {custom ? (
            <Input
              id="server-url"
              type="url"
              value={settings.serverUrlInput}
              onChange={(event) => settings.setServerUrlInput(event.target.value)}
              placeholder="https://your-server.example.com"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(settings.inputError)}
              aria-describedby="connection-note"
            />
          ) : (
            <output id="server-url" className="server-connection-current-site">
              {window.location.origin}
            </output>
          )}
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="server-connection-test"
            onClick={settings.testConnection}
            disabled={settings.checking}
          >
            {settings.checking ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : null}
            {settings.checking ? "测试中…" : "测试连接"}
          </Button>
        </div>
        {settings.inputError ? (
          <Field.Error match className="server-connection-input-error" role="alert">
            {settings.inputError}
          </Field.Error>
        ) : null}
        <Field.Description id="connection-note" className="server-connection-note">
          {custom
            ? "保存后，此客户端将连接到这个服务器。"
            : "跟随当前站点连接，无需另填地址。"}
        </Field.Description>
      </Field.Root>

      {settings.health ? (
        <Collapsible.Root className="server-connection-result" data-tone="success">
          <div className="server-connection-result-line">
            <span className="server-connection-status" role="status">
              <CheckCircle2 aria-hidden="true" />
              连接正常
            </span>
            <Collapsible.Trigger
              render={<Button type="button" variant="ghost" size="sm" />}
              className="server-connection-details-toggle"
            >
              <span className="connection-details-closed">查看详情</span>
              <span className="connection-details-open">收起详情</span>
              <ChevronDown data-icon="inline-end" />
            </Collapsible.Trigger>
          </div>
          <Collapsible.Panel>
            <dl className="server-connection-facts">
              <div><dt>服务器版本</dt><dd>{settings.health.serverVersion}</dd></div>
              <div><dt>API 版本</dt><dd>{settings.health.apiVersion}</dd></div>
              <div><dt>Telegram</dt><dd>{telegramStatus}</dd></div>
            </dl>
          </Collapsible.Panel>
        </Collapsible.Root>
      ) : settings.checking || settings.connectionError ? (
        <div
          className="server-connection-result"
          data-tone={settings.connectionError ? "error" : "pending"}
          role="status"
        >
          <span className="server-connection-status">
            {settings.checking ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <AlertCircle aria-hidden="true" />
            )}
            {settings.connectionError || "正在检查服务器…"}
          </span>
        </div>
      ) : null}
    </section>
  );
}
