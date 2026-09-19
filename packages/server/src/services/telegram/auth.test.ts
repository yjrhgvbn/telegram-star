import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ invoke:vi.fn(),connect:vi.fn(),destroy:vi.fn(),getMe:vi.fn(),sendCode:vi.fn(),save:vi.fn(),computeCheck:vi.fn(),activate:vi.fn(),exists:vi.fn(),readSession:vi.fn() }));
vi.mock("telegram", async original => ({
  ...await original<typeof import("telegram")>(),
  TelegramClient: class {
    connected=true; session={save:()=>"isolated-session"};
    connect=mocks.connect; invoke=mocks.invoke; destroy=mocks.destroy; getMe=mocks.getMe; sendCode=mocks.sendCode;
  },
}));
vi.mock("telegram/sessions/index.js",()=>({StringSession:class { save() { return "isolated-session"; } }}));
vi.mock("telegram/Password.js",()=>({computeCheck:mocks.computeCheck}));
vi.mock("./gramJsDiagnostics.js",()=>({installGramJsDiagnostics:vi.fn()}));
vi.mock("./listener.js",()=>({startMessageListener:vi.fn()}));
vi.mock("./messageCatchUp.js",()=>({activateMessageCatchUp:mocks.activate,deactivateMessageCatchUp:vi.fn()}));
vi.mock("../../config.js",()=>({appConfig:{telegram:{apiId:1,apiHash:"test",sessionPath:"/tmp/never-written-session"}}}));
vi.mock("../appConfig.js",()=>({getTelegramConfigStatus:vi.fn()}));
vi.mock("fs",()=>({existsSync:mocks.exists,writeFileSync:mocks.save,readFileSync:mocks.readSession,mkdirSync:vi.fn()}));
import { sendCode,loginWithCode,logout,resetTelegramClient,initClient } from "./auth.js";
import { getClient,getConnectionStatus } from "./client.js";
beforeEach(async()=>{
  await resetTelegramClient(); vi.clearAllMocks();
  mocks.invoke.mockReset(); mocks.exists.mockReturnValue(false); mocks.readSession.mockReturnValue("");
  mocks.connect.mockResolvedValue(undefined); mocks.destroy.mockResolvedValue(undefined);
  mocks.sendCode.mockResolvedValue({phoneCodeHash:"sent-hash"});
  mocks.getMe.mockResolvedValue({id:123}); mocks.computeCheck.mockResolvedValue({password:"check"});
});
describe("single-step Telegram authentication",()=>{
  it("does not treat sending a code as account authorization or repeat an incorrect code",async()=>{
    await sendCode("123");
    expect(getConnectionStatus()).toMatchObject({authorized:false,waitingForCode:true});
    mocks.invoke.mockRejectedValue(Object.assign(new Error("PHONE_CODE_INVALID"),{errorMessage:"PHONE_CODE_INVALID"}));
    expect(await loginWithCode("123","wrong")).toMatchObject({status:"error"});
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke.mock.calls[0][0]).toMatchObject({phoneCodeHash:"sent-hash"});
  });
  it("returns password_required without retrying and performs one password check on the next request",async()=>{
    await sendCode("123");
    mocks.invoke.mockRejectedValueOnce(Object.assign(new Error("SESSION_PASSWORD_NEEDED"),{errorMessage:"SESSION_PASSWORD_NEEDED"}));
    expect(await loginWithCode("123","code")).toEqual({status:"password_required"});
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(getConnectionStatus()).toMatchObject({authorized:false,waitingForPassword:true});
    mocks.invoke.mockResolvedValue({});
    expect(await loginWithCode("123","code","password")).toEqual({status:"success"});
    expect(mocks.invoke).toHaveBeenCalledTimes(3);
    expect(getConnectionStatus().authorized).toBe(true);
  });
  it("destroys and detaches the old client even when Telegram logout fails",async()=>{
    await sendCode("123");
    mocks.invoke.mockRejectedValue(new Error("offline"));
    await logout();
    expect(getClient()).toBeNull(); expect(mocks.destroy).toHaveBeenCalledOnce();
    expect(getConnectionStatus()).toMatchObject({authorized:false,connected:false});
  });
});


afterEach(async () => {
  mocks.destroy.mockResolvedValue(undefined);
  const cleanup = resetTelegramClient();
  if (vi.isFakeTimers()) await vi.runAllTimersAsync();
  await cleanup;
  vi.useRealTimers();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe("authentication deadlines and stale replies", () => {
  it("bounds sendCode and hanging cleanup, releases the login lock, and ignores the late code", async () => {
    vi.useFakeTimers();
    const rpc = deferred<{ phoneCodeHash: string }>();
    mocks.sendCode.mockReturnValueOnce(rpc.promise);
    mocks.destroy.mockReturnValueOnce(new Promise(() => {}));
    const pending = sendCode("123");
    const rejected = expect(pending).rejects.toThrow("Sending Telegram code timed out");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(getClient()).toBeNull();
    await vi.advanceTimersByTimeAsync(3_000);
    await rejected;
    await sendCode("456");
    const nextClient = getClient();
    rpc.resolve({ phoneCodeHash: "late-old-code" });
    await vi.advanceTimersByTimeAsync(0);
    expect(getClient()).toBe(nextClient);
    mocks.invoke.mockResolvedValue({});
    expect(await loginWithCode("456", "fresh")).toEqual({ status: "success" });
    expect(mocks.invoke.mock.calls.at(-1)?.[0]).toMatchObject({ phoneNumber: "456", phoneCodeHash: "sent-hash" });
  });

  it("bounds a late connection and cleans it up again without replacing a new client", async () => {
    vi.useFakeTimers();
    const connection = deferred<void>();
    mocks.connect.mockReturnValueOnce(connection.promise);
    const pending = sendCode("123");
    const rejected = expect(pending).rejects.toThrow("Connecting to Telegram timed out");
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    await sendCode("456");
    const nextClient = getClient();
    connection.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(getClient()).toBe(nextClient);
    expect(mocks.destroy).toHaveBeenCalledTimes(2);
    expect(mocks.sendCode).toHaveBeenCalledOnce();
  });

  it.each(["SignIn", "GetPassword", "computeCheck", "CheckPassword", "getMe"])(
    "bounds %s and cannot persist a session from its late completion", async (stage) => {
      vi.useFakeTimers();
      await sendCode("123");
      const rpc = deferred<any>();
      mocks.invoke.mockResolvedValue({});
      if (["GetPassword", "computeCheck", "CheckPassword"].includes(stage)) {
        mocks.invoke.mockRejectedValueOnce(Object.assign(new Error("SESSION_PASSWORD_NEEDED"), { errorMessage: "SESSION_PASSWORD_NEEDED" }));
        expect(await loginWithCode("123", "code")).toEqual({ status: "password_required" });
      }
      if (stage === "getMe") mocks.getMe.mockReturnValueOnce(rpc.promise);
      else if (stage === "computeCheck") mocks.computeCheck.mockReturnValueOnce(rpc.promise);
      else if (stage === "CheckPassword") mocks.invoke.mockResolvedValueOnce({}).mockReturnValueOnce(rpc.promise);
      else mocks.invoke.mockReturnValueOnce(rpc.promise);
      const pending = loginWithCode("123", "code", "password");
      await vi.advanceTimersByTimeAsync(30_000);
      expect(await pending).toMatchObject({ status: "error", error: expect.stringContaining("timed out") });
      expect(getClient()).toBeNull();
      expect(mocks.save).not.toHaveBeenCalled();
      await sendCode("456");
      const nextClient = getClient();
      rpc.resolve({ id: 999 });
      await vi.advanceTimersByTimeAsync(0);
      expect(getClient()).toBe(nextClient);
      expect(getConnectionStatus().authorized).toBe(false);
      expect(mocks.save).not.toHaveBeenCalled();
    },
  );

  it("caps remote logout and client destruction even if both promises never resolve", async () => {
    vi.useFakeTimers();
    await sendCode("123");
    mocks.invoke.mockReturnValueOnce(new Promise(() => {}));
    mocks.destroy.mockReturnValueOnce(new Promise(() => {}));
    const pending = logout();
    expect(getClient()).toBeNull();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mocks.destroy).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(pending).resolves.toBeUndefined();
    expect(getConnectionStatus()).toMatchObject({ authorized: false, connected: false });
  });

  it("cancels an old auth request immediately on reset without its finally clearing a new request lock", async () => {
    vi.useFakeTimers();
    const oldRpc = deferred<{ phoneCodeHash: string }>();
    const newRpc = deferred<{ phoneCodeHash: string }>();
    mocks.sendCode.mockReturnValueOnce(oldRpc.promise).mockReturnValueOnce(newRpc.promise);
    const old = sendCode("123");
    const oldRejected = expect(old).rejects.toThrow("cancelled");
    await vi.advanceTimersByTimeAsync(0);
    await resetTelegramClient();
    const next = sendCode("456");
    await vi.advanceTimersByTimeAsync(0);
    await oldRejected;
    oldRpc.resolve({ phoneCodeHash: "old" });
    await vi.advanceTimersByTimeAsync(0);
    await expect(sendCode("789")).rejects.toThrow("already in progress");
    newRpc.resolve({ phoneCodeHash: "new" });
    expect(await next).toEqual({ status: "code_sent" });
  });

  it("bounds saved-session initialization getMe without leaving an authorized client", async () => {
    vi.useFakeTimers();
    mocks.exists.mockReturnValue(true);
    mocks.readSession.mockReturnValue("isolated-saved-session");
    mocks.getMe.mockReturnValueOnce(new Promise(() => {}));
    const pending = initClient();
    await vi.advanceTimersByTimeAsync(30_000);
    await pending;
    expect(getClient()).toBeNull();
    expect(getConnectionStatus().authorized).toBe(false);
    expect(mocks.activate).not.toHaveBeenCalled();
  });
});
