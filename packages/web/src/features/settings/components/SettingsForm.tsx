import { useEffect, useRef, useState } from "react";
import { Field } from "@base-ui/react/field";
import { Menu } from "@base-ui/react/menu";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { ArrowLeft, Check, ChevronRight, LoaderCircle, MoreHorizontal, RefreshCw } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ClientDevicesSettings } from "./ClientDevicesSettings";
import { ServerConnectionSettings } from "./ServerConnectionSettings";
import { thumbQualityOptions, type useSettingsForm } from "../hooks/useSettingsForm";
import { useClientDevices } from "../hooks/useClientDevices";
import type { useServerConnectionSettings } from "../hooks/useServerConnectionSettings";
import "./SettingsForm.css";

export const SETTINGS_FORM_ID = "settings-form";
type SettingsFormState = ReturnType<typeof useSettingsForm>;
type ConnectionState = ReturnType<typeof useServerConnectionSettings>;
type SectionId = "connection" | "telegram" | "media" | "clients";
const SECTIONS: { id: SectionId; title: string }[] = [
  { id: "connection", title: "服务器连接" },
  { id: "telegram", title: "Telegram" },
  { id: "media", title: "媒体" },
  { id: "clients", title: "设备" },
];
const qualityDescriptions = [
  "优先加载小尺寸缩略图，减少流量消耗。",
  "兼顾清晰度和加载速度，适合日常浏览。",
  "优先加载较清晰的缩略图，流量消耗更多。",
];

export function SettingsForm({ settings, connection, onNavigateRequest }: { settings: SettingsFormState; connection: ConnectionState; onNavigateRequest?: (action: () => void) => void }) {
  const { sectionId } = useParams<{ sectionId?: string }>();
  const navigate = useNavigate();
  const devices = useClientDevices();
  // Keep the existing /settings/clients URL, and accept the prototype's devices alias.
  const routeSection = sectionId === "devices" ? "clients" : sectionId;
  const activeSection = SECTIONS.find(section => section.id === routeSection) ?? SECTIONS[0];
  const active = activeSection.id;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [confirmation, setConfirmation] = useState<Exclude<SectionId, "clients"> | "switch-server" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const dirty = active === "connection" ? connection.dirty : active === "telegram" ? settings.telegramDirty : active === "media" ? settings.mediaDirty : false;
  const saving = settings.savingSection === active;
  const notice = active === "connection" ? connection.notice : active === "telegram" ? settings.telegramNotice : active === "media" ? settings.mediaNotice : null;
  const configUnavailable = (active === "telegram" || active === "media") && (!settings.status || !settings.mediaStatus);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setMenuOpen(false);
  }, [active]);

  function saveConnection() {
    if (settings.saving || devices.deletingId) return;
    if (connection.saveConnection()) {
      // A different backend owns different credentials and media settings.
      settings.resetDraft("telegram");
      settings.resetDraft("media");
    }
  }
  function saveActive() {
    if (settings.saving || devices.deletingId || !dirty) return;
    if (active === "connection") {
      if (settings.dirty) setConfirmation("switch-server");
      else saveConnection();
    } else if (active === "telegram" || active === "media") {
      void settings.handleSave(active);
    }
  }
  function confirmAction() {
    if (settings.saving || devices.deletingId) return;
    // The dialog records its target when opened, so route changes cannot reset another section.
    if (confirmation === "switch-server") saveConnection();
    else if (confirmation === "connection") connection.resetConnectionDraft();
    else if (confirmation) settings.resetDraft(confirmation);
    setConfirmation(null);
  }

  return <div className="settings-workspace" data-detail={sectionId !== undefined || undefined}>
    <aside className="settings-workspace__sidebar">
      <div className="settings-sidebar-heading"><h2>设置</h2></div>
      <nav className="settings-category-list" aria-label="设置分类">
        {SECTIONS.map(section => <button key={section.id} type="button" aria-current={active === section.id ? "page" : undefined} onClick={() => navigate(`/settings/${section.id}`, { flushSync: true })}>
          <span>{section.title}</span><ChevronRight aria-hidden="true" />
        </button>)}
      </nav>
    </aside>
    <main className="settings-workspace__detail">
      <header className="settings-detail-heading">
        <div className="settings-detail-title">
          <Button type="button" variant="ghost" size="icon-lg" className="settings-mobile-back" aria-label="返回设置" onClick={() => navigate("/settings")}><ArrowLeft /></Button>
          <h1>{activeSection.title}</h1>
        </div>
        <div className="settings-heading-actions">
          <span className="settings-save-state" role="status">{dirty ? "未保存" : notice ? "已保存" : ""}</span>
          {dirty && active !== "clients" ? <>
            <Button type="button" variant="ghost" size="sm" className="settings-reset" disabled={settings.saving} onClick={() => setConfirmation(active)}>放弃修改</Button>
            <Menu.Root open={menuOpen} onOpenChange={setMenuOpen}>
              <Menu.Trigger render={<Button type="button" variant="ghost" size="icon-lg" className="settings-mobile-menu" aria-label="更多设置操作" disabled={settings.saving} />}><MoreHorizontal /></Menu.Trigger>
              <Menu.Portal><Menu.Positioner className="settings-theme settings-menu-positioner" align="end" sideOffset={6}><Menu.Popup className="settings-actions-menu"><Menu.Group><Menu.Item onClick={() => setConfirmation(active)}>放弃修改</Menu.Item></Menu.Group></Menu.Popup></Menu.Positioner></Menu.Portal>
            </Menu.Root>
          </> : null}
          {active === "clients" ? <Button type="button" variant="outline" size="lg" onClick={devices.refresh} disabled={devices.refreshing}><RefreshCw className={devices.refreshing ? "animate-spin" : undefined} data-icon="inline-start" />刷新</Button> : <Button type="submit" form={SETTINGS_FORM_ID} size="lg" className="settings-save" disabled={!dirty || settings.saving || Boolean(devices.deletingId) || configUnavailable || ((active === "telegram" || active === "media") && settings.loading)}>{saving ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : null}{saving ? "保存中" : "保存"}</Button>}
        </div>
      </header>
      <div className="settings-detail-scroll" ref={scrollRef}>
        <form id={SETTINGS_FORM_ID} onSubmit={event => { event.preventDefault(); saveActive(); }} noValidate>
          <div hidden={active !== "connection"}><ServerConnectionSettings settings={connection} /></div>
          {(active === "telegram" || active === "media") && settings.loadError ? <div className="settings-load-error" role="alert"><span>{settings.loadError}</span><Button type="button" variant="ghost" size="sm" onClick={settings.loadStatus} disabled={settings.loading}>重新加载</Button></div> : null}
          {(active === "telegram" || active === "media") && configUnavailable ? <div className="settings-loading" role="status">{settings.loading ? <><LoaderCircle className="size-4 animate-spin" />读取配置中</> : "暂时无法读取配置"}</div> : <>
            <div hidden={active !== "telegram"}><TelegramSettings settings={settings} /></div>
            <div hidden={active !== "media"}><MediaSettings settings={settings} /></div>
          </>}
        </form>
        <div hidden={active !== "clients"}><ClientDevicesSettings state={devices} onNavigateRequest={onNavigateRequest} /></div>
      </div>
    </main>
    <AlertDialog open={confirmation !== null} onOpenChange={open => { if (!open) setConfirmation(null); }}>
      <AlertDialogContent className="settings-theme" size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmation === "switch-server" ? "切换服务器并放弃其他修改？" : "放弃本页修改？"}</AlertDialogTitle>
          <AlertDialogDescription>{confirmation === "switch-server" ? "Telegram 或媒体仍有未保存的修改。切换服务器后将读取新服务器的配置。" : `“${SECTIONS.find(section => section.id === confirmation)?.title ?? "当前分类"}”会恢复到上次保存的设置。`}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>继续编辑</AlertDialogCancel><AlertDialogAction onClick={confirmAction} disabled={settings.saving || Boolean(devices.deletingId)}>{confirmation === "switch-server" ? "切换服务器" : "放弃修改"}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}

function TelegramSettings({ settings }: { settings: SettingsFormState }) {
  const [showHash, setShowHash] = useState(false);
  const status = settings.status;
  const fieldErrors = settings.telegramFieldErrors;
  const configuredInDatabase = status?.databaseConfigured ?? false;
  const source = status?.telegramConfigSource === "database" ? "数据库" : status?.telegramConfigSource === "env" ? "环境变量" : "未配置";
  return <section className="settings-fields" aria-label="Telegram 设置">
    <div className="settings-form-label"><h2>应用凭据</h2><span>当前服务器</span></div>
    <div className="settings-credential-state"><span>来源 <strong>{source}</strong></span><span className="settings-authorization" data-authorized={settings.telegramAuthorized || undefined}>{settings.telegramAuthorized ? <Check aria-hidden="true" /> : null}{settings.telegramAuthorized ? "已授权" : "未授权"}</span></div>
    <Field.Root className="settings-field" invalid={Boolean(fieldErrors.apiId)}>
      <Field.Label htmlFor="settings-api-id">API ID</Field.Label>
      <Input id="settings-api-id" className="settings-api-id" inputMode="numeric" value={settings.apiId} onChange={event => settings.setApiId(event.target.value)} autoComplete="off" disabled={settings.saving} aria-invalid={Boolean(fieldErrors.apiId)} aria-describedby={fieldErrors.apiId ? "settings-api-id-error" : undefined} />
      {fieldErrors.apiId ? <p className="settings-field-error" id="settings-api-id-error" role="alert">{fieldErrors.apiId}</p> : null}
    </Field.Root>
    <Field.Root className="settings-field" invalid={Boolean(fieldErrors.apiHash)}>
      <Field.Label htmlFor="settings-api-hash">API Hash</Field.Label>
      <div className="settings-hash-input"><Input id="settings-api-hash" type={showHash ? "text" : "password"} value={settings.apiHash} onChange={event => settings.setApiHash(event.target.value)} placeholder={configuredInDatabase ? "已配置，填写新值替换" : "输入 API Hash"} autoComplete="new-password" spellCheck={false} disabled={settings.saving} aria-invalid={Boolean(fieldErrors.apiHash)} aria-describedby={`settings-hash-note${fieldErrors.apiHash ? " settings-api-hash-error" : ""}`} /><Button type="button" variant="ghost" size="sm" aria-pressed={showHash} onClick={() => setShowHash(value => !value)}>{showHash ? "隐藏" : "显示"}</Button></div>
      <Field.Description className="settings-field-note" id="settings-hash-note">{configuredInDatabase ? "留空会保留已保存的 API Hash。" : status?.telegramConfigSource === "env" ? "保存到数据库时，需要重新填写 API Hash。" : "填写 Telegram 应用的 API ID 和 API Hash。"}</Field.Description>
      {fieldErrors.apiHash ? <p className="settings-field-error" id="settings-api-hash-error" role="alert">{fieldErrors.apiHash}</p> : null}
    </Field.Root>
    {settings.telegramError ? <p className="settings-field-error settings-submit-error" role="alert">{settings.telegramError}</p> : null}
    <p className="settings-section-note">保存凭据不会切换当前账号或重新登录。</p>
  </section>;
}

function MediaSettings({ settings }: { settings: SettingsFormState }) {
  return <section className="settings-fields" aria-label="媒体设置">
    <div className="settings-form-label"><h2 id="settings-quality-label">缩略图质量</h2><span>当前服务器</span></div>
    <RadioGroup className="settings-quality-options" aria-labelledby="settings-quality-label" value={settings.thumbIndex} onValueChange={value => settings.setThumbIndex(value)} disabled={settings.saving}>
      {thumbQualityOptions.map(option => <Radio.Root className="settings-quality-option" value={option.value} key={option.value}>{option.title}</Radio.Root>)}
    </RadioGroup>
    <p className="settings-quality-description">{qualityDescriptions[settings.thumbIndex]}</p>
    {settings.mediaError ? <p className="settings-field-error" role="alert">{settings.mediaError}</p> : null}
    <p className="settings-section-note">应用于之后加载的消息缩略图，原视频画质不受影响。</p>
  </section>;
}
