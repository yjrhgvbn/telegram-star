// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfigStatus } from "@telegram-star/shared/contracts/config";
import { SERVER_CONFIG_STORAGE_KEY } from "@/shared/runtime/serverConfig";
import { createQueryWrapper } from "@/test/queryTestUtils";
import { useSettingsForm } from "../hooks/useSettingsForm";
import { useServerConnectionSettings } from "../hooks/useServerConnectionSettings";
import { SettingsForm } from "./SettingsForm";

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
vi.mock("@/api/client", () => ({ api: { config: apiMocks } }));
vi.mock("../hooks/useClientDevices", () => ({
  useClientDevices: () => ({ devices: [], currentClientId: "test-browser", deletingId: null, loading: false, refreshing: false, error: null, refresh: vi.fn(), deleteDevice: vi.fn() }),
}));
const config: AppConfigStatus = {
  telegram: { telegramConfigured: true, telegramConfigSource: "database", databaseConfigured: true, apiId: 12345, apiHashMasked: "ab***cd" },
  media: { thumbIndex: 1, thumbQuality: "medium" },
};
function Harness() {
  const settings = useSettingsForm({ telegramAuthorized: true });
  const connection = useServerConnectionSettings();
  return <SettingsForm settings={settings} connection={connection} />;
}
function renderSettings(section = "telegram") {
  const Wrapper = createQueryWrapper();
  render(<Wrapper><MemoryRouter initialEntries={[`/settings/${section}`]}><Routes>
    <Route path="/settings" element={<Harness />} />
    <Route path="/settings/:sectionId" element={<Harness />} />
  </Routes></MemoryRouter></Wrapper>);
}
function category(name: string) { return within(screen.getByRole("navigation", { name: "设置分类" })).getByRole("button", { name }); }

beforeEach(() => {
  apiMocks.get.mockReset().mockResolvedValue(config);
  apiMocks.update.mockReset().mockImplementation(async (data) => ({ ...config, ...data, telegram: { ...config.telegram, ...data.telegram }, media: { ...config.media, ...data.media } }));
});
afterEach(() => { cleanup(); window.localStorage.clear(); vi.restoreAllMocks(); });

describe("SettingsForm", () => {
  it("saves media independently while retaining invalid Telegram edits and field errors", async () => {
    const user = userEvent.setup();
    renderSettings();
    const apiId = await screen.findByLabelText("API ID");
    await user.clear(apiId);
    await user.type(apiId, "invalid");
    await user.click(screen.getByRole("button", { name: "保存", exact: true }));
    expect(apiMocks.update).not.toHaveBeenCalled();
    expect(apiId.getAttribute("aria-invalid")).toBe("true");
    await user.click(category("媒体"));
    await user.click(screen.getByRole("radio", { name: "清晰" }));
    await user.click(screen.getByRole("button", { name: "保存", exact: true }));
    await waitFor(() => expect(apiMocks.update).toHaveBeenCalledWith({ media: { thumbIndex: 2 } }));
    await user.click(category("Telegram"));
    expect((screen.getByLabelText("API ID") as HTMLInputElement).value).toBe("invalid");
    expect(screen.getByLabelText("API ID").getAttribute("aria-invalid")).toBe("true");
  });

  it("discards only the selected category and preserves the other draft", async () => {
    const user = userEvent.setup();
    renderSettings();
    const apiId = await screen.findByLabelText("API ID");
    await user.clear(apiId);
    await user.type(apiId, "67890");
    await user.click(category("媒体"));
    await user.click(screen.getByRole("radio", { name: "清晰" }));
    await user.click(category("Telegram"));
    await user.click(screen.getByRole("button", { name: "放弃修改", exact: true }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "放弃修改", exact: true }));
    await waitFor(() => expect((screen.getByLabelText("API ID") as HTMLInputElement).value).toBe("12345"));
    await user.click(category("媒体"));
    expect(screen.getByRole("radio", { name: "清晰" }).getAttribute("aria-checked")).toBe("true");
    expect((screen.getByRole("button", { name: "保存", exact: true }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not persist an empty custom address, and saves the connection without submitting server settings", async () => {
    const user = userEvent.setup();
    renderSettings("connection");
    await user.click(screen.getByRole("button", { name: "自定义地址", exact: true }));
    await user.click(screen.getByRole("button", { name: "保存", exact: true }));
    expect(window.localStorage.getItem(SERVER_CONFIG_STORAGE_KEY)).toBeNull();
    expect(screen.getByLabelText("服务器地址").getAttribute("aria-invalid")).toBe("true");
    await user.type(screen.getByLabelText("服务器地址"), "https://example.com/api/");
    await user.click(screen.getByRole("button", { name: "保存", exact: true }));
    expect(window.localStorage.getItem(SERVER_CONFIG_STORAGE_KEY)).toBe("https://example.com");
    expect(apiMocks.update).not.toHaveBeenCalled();
  });

  it("protects other drafts before switching backends", async () => {
    const user = userEvent.setup();
    renderSettings();
    const apiId = await screen.findByLabelText("API ID");
    await user.clear(apiId);
    await user.type(apiId, "67890");
    await user.click(category("服务器连接"));
    await user.click(screen.getByRole("button", { name: "自定义地址", exact: true }));
    await user.type(screen.getByLabelText("服务器地址"), "https://example.com");
    await user.click(screen.getByRole("button", { name: "保存", exact: true }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(window.localStorage.getItem(SERVER_CONFIG_STORAGE_KEY)).toBeNull();
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "继续编辑" }));
    await user.click(category("Telegram"));
    expect((screen.getByLabelText("API ID") as HTMLInputElement).value).toBe("67890");
  });
});
