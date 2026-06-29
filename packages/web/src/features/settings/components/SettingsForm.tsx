import { Image, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SettingRow } from "./SettingRow";
import { SettingsStatusPanel } from "./SettingsStatusPanel";
import {
  thumbQualityOptions,
  type useSettingsForm,
} from "../hooks/useSettingsForm";

export const SETTINGS_FORM_ID = "settings-form";

type SettingsFormState = ReturnType<typeof useSettingsForm>;

export function SettingsForm({
  settings,
}: {
  settings: SettingsFormState;
}) {
  return (
    <Card className="bg-card/80 shadow-sm ring-1 ring-foreground/10" size="sm">
      <CardContent className="px-4 py-4">
        <form
          id={SETTINGS_FORM_ID}
          onSubmit={settings.handleSave}
          className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]"
        >
          <SettingsStatusPanel
            status={settings.status}
            mediaStatus={settings.mediaStatus}
            apiId={settings.apiId}
            thumbIndex={settings.thumbIndex}
            invalidItems={settings.invalidItems}
            summary={settings.statusSummary}
          />

          <div className="flex min-w-0 flex-col gap-3">
            <SettingRow
              icon={KeyRound}
              title="Telegram API"
              meta={
                <Badge
                  variant={settings.status?.telegramConfigured ? "secondary" : "destructive"}
                  className="h-6 rounded-lg px-2"
                >
                  {settings.status?.telegramConfigured ? "有效" : "缺失"}
                </Badge>
              }
            >
              <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                <div className="flex flex-col gap-2">
                  <label htmlFor="telegram-api-id" className="text-sm font-medium">
                    API ID
                  </label>
                  <Input
                    id="telegram-api-id"
                    inputMode="numeric"
                    value={settings.apiId}
                    onChange={(event) => settings.setApiId(event.target.value)}
                    placeholder="123456"
                    className="h-10 bg-background/80"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="telegram-api-hash" className="text-sm font-medium">
                    API Hash
                  </label>
                  <Input
                    id="telegram-api-hash"
                    type="password"
                    value={settings.apiHash}
                    onChange={(event) => settings.setApiHash(event.target.value)}
                    placeholder={settings.status?.apiHashMasked || "请输入 API Hash"}
                    className="h-10 bg-background/80"
                  />
                </div>
              </div>
            </SettingRow>

            <SettingRow
              icon={Image}
              title="媒体缩略图"
              meta={
                <Badge variant="secondary" className="h-6 rounded-lg px-2">
                  {settings.mediaStatus?.thumbQuality ?? "medium"}
                </Badge>
              }
            >
              <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-muted/65 p-1">
                {thumbQualityOptions.map((option) => {
                  const selected = settings.thumbIndex === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => settings.setThumbIndex(option.value)}
                      aria-pressed={selected}
                      className={cn(
                        "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-md px-2 py-2 text-center transition",
                        selected
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
                      )}
                    >
                      <span className="text-sm font-medium leading-5">{option.title}</span>
                      <span className="text-xs leading-4">{option.description}</span>
                    </button>
                  );
                })}
              </div>
            </SettingRow>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
