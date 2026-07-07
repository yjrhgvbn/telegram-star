// @vitest-environment jsdom
import { useState, type ComponentProps, type FormEvent } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SERVER_CONFIG_STORAGE_KEY } from "@/shared/runtime/serverConfig";
import { createQueryWrapper } from "@/test/queryTestUtils";
import { SETTINGS_FORM_ID, SettingsForm } from "./SettingsForm";

type SettingsFormState = ComponentProps<typeof SettingsForm>["settings"];

function SettingsFormHarness({
  onSubmit,
}: {
  onSubmit: (state: { apiId: string; apiHash: string; thumbIndex: number }) => void;
}) {
  const [apiId, setApiId] = useState("12345");
  const [apiHash, setApiHash] = useState("");
  const [thumbIndex, setThumbIndex] = useState(1);

  const settings: SettingsFormState = {
    status: {
      telegramConfigured: true,
      telegramConfigSource: "database",
      databaseConfigured: true,
      apiId: 12345,
      apiHashMasked: "ab***cd",
    },
    mediaStatus: {
      thumbIndex,
      thumbQuality: thumbIndex === 2 ? "high" : thumbIndex === 0 ? "low" : "medium",
    },
    telegramAuthorized: true,
    apiId,
    apiHash,
    thumbIndex,
    loading: false,
    saving: false,
    error: null,
    notice: null,
    invalidItems: [],
    statusSummary: { title: "当前没有失效项", tone: "valid" },
    loadStatus: vi.fn(),
    handleSave: (event: FormEvent) => {
      event.preventDefault();
      onSubmit({ apiId, apiHash, thumbIndex });
    },
    setApiId,
    setApiHash,
    setThumbIndex,
  };

  return <SettingsForm settings={settings} />;
}

function mockClientDevicesFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

describe("SettingsForm", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("edits Telegram settings and thumb quality in one form", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    mockClientDevicesFetch();
    render(<SettingsFormHarness onSubmit={onSubmit} />, {
      wrapper: createQueryWrapper(),
    });

    const serverUrlInput = screen.getByLabelText("后端地址") as HTMLInputElement;

    await user.type(serverUrlInput, "https://example.com/api/");
    await user.click(screen.getByRole("button", { name: /保存地址/ }));
    expect(window.localStorage.getItem(SERVER_CONFIG_STORAGE_KEY)).toBe("https://example.com");
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Telegram/ }));
    const apiIdInput = screen.getByLabelText("API ID") as HTMLInputElement;
    const apiHashInput = screen.getByLabelText("API Hash") as HTMLInputElement;

    await user.clear(apiIdInput);
    await user.type(apiIdInput, "67890");
    await user.type(apiHashInput, "new-hash");

    await user.click(screen.getByRole("button", { name: /媒体/ }));
    await user.click(screen.getByRole("button", { name: /清晰/ }));

    expect(apiIdInput.value).toBe("67890");
    expect(apiHashInput.value).toBe("new-hash");
    expect(screen.getByRole("button", { name: /清晰/ }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.submit(document.getElementById(SETTINGS_FORM_ID) as HTMLFormElement);

    expect(onSubmit).toHaveBeenCalledWith({
      apiId: "67890",
      apiHash: "new-hash",
      thumbIndex: 2,
    });
  });
});
