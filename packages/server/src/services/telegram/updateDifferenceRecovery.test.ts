import { describe,expect,it,vi } from "vitest";
import { Api } from "telegram";
import bigInt from "big-integer";
import { recoverUpdateDifferences, type UpdateRecoveryCursor } from "./updateDifferenceRecovery.js";
const user = new Api.User({id:bigInt(20),accessHash:bigInt(30),firstName:"Alice"});
const channel = new Api.Channel({id:bigInt(10),accessHash:bigInt(40),title:"News",photo:new Api.ChatPhotoEmpty(),date:1});
function setup() {
 let cursor:UpdateRecoveryCursor={global:{pts:100,qts:0,date:100},channels:{"10":50}};
 const ingest=vi.fn().mockResolvedValue("created");
 const deps={isActive:()=>true,loadCursor:async()=>structuredClone(cursor),saveCursor:vi.fn(async value=>{cursor=structuredClone(value);}),ingest};
 return {deps,ingest,read:()=>cursor};
}
describe("Telegram incremental update recovery",()=>{
 it("recovers edits older than the history window for both private chats and channels",async()=>{
  const state=setup();
  const oldPrivate={id:7,className:"Message",peerId:new Api.PeerUser({userId:bigInt(20)}),date:1,editDate:200,message:"release"};
  const oldChannel={...oldPrivate,id:8,peerId:new Api.PeerChannel({channelId:bigInt(10)})};
  const invoke=vi.fn(async request=>request.className==="updates.GetDifference" ?
   {className:"updates.Difference",newMessages:[],otherUpdates:[{className:"UpdateEditMessage",message:oldPrivate}],users:[user],chats:[],state:{pts:101,qts:0,date:200}} :
   {className:"updates.ChannelDifference",newMessages:[],otherUpdates:[{className:"UpdateEditChannelMessage",message:oldChannel}],users:[],chats:[channel],pts:51,final:true});
  const result=await recoverUpdateDifferences({client:{invoke} as any,accountId:"1",dialogs:[{entity:user},{entity:channel,dialog:{pts:51}}],chatScope:null},state.deps);
  expect(result.savedCount).toBe(2);expect(state.ingest).toHaveBeenCalledWith(oldPrivate,user);expect(state.ingest).toHaveBeenCalledWith(oldChannel,channel);
  expect(state.read()).toEqual({global:{pts:101,qts:0,date:200},channels:{"10":51}});
 });
 it("does not acknowledge a failed ingestion, so the next run can retry the same edit",async()=>{
  const state=setup();state.ingest.mockRejectedValue(new Error("DB unavailable"));
  const invoke=vi.fn(async request=>request.className==="updates.GetDifference" ? {className:"updates.DifferenceEmpty",date:200} :
   {className:"updates.ChannelDifference",newMessages:[],otherUpdates:[{className:"UpdateEditChannelMessage",message:{id:8,className:"Message",peerId:new Api.PeerChannel({channelId:bigInt(10)}),date:1,message:"release"}}],users:[],chats:[channel],pts:51,final:true});
  const result=await recoverUpdateDifferences({client:{invoke} as any,accountId:"1",dialogs:[{entity:channel,dialog:{pts:51}}],chatScope:null},state.deps);
  expect(result.failedScopes).toBe(1);expect(state.read().channels["10"]).toBe(50);
 });
 it("establishes a baseline without scanning old history on first activation",async()=>{
  const state=setup();state.deps.loadCursor=async()=>null as any;
  const invoke=vi.fn().mockResolvedValue({pts:100,qts:0,date:200});
  await recoverUpdateDifferences({client:{invoke} as any,accountId:"1",dialogs:[{entity:channel,dialog:{pts:51}}],chatScope:null},state.deps);
  expect(invoke).toHaveBeenCalledOnce();expect(state.ingest).not.toHaveBeenCalled();expect(state.read().channels["10"]).toBe(51);
 });
});

describe("difference entity resolution", () => {
  it.each(["private", "channel"])("keeps complete dialog entities when a %s difference contains min entities", async (kind) => {
    const state = setup();
    const isChannel = kind === "channel";
    const entity = isChannel ? channel : user;
    const partial = isChannel
      ? new Api.Channel({ id: channel.id, min: true, title: "News", photo: new Api.ChatPhotoEmpty(), date: 1 })
      : new Api.User({ id: user.id, min: true, firstName: "Alice" });
    const peer = isChannel
      ? new Api.PeerChannel({ channelId: channel.id })
      : new Api.PeerUser({ userId: user.id });
    // A real GramJS message exercises _finishInit and input-peer conversion, which
    // plain object fixtures do not cover.
    const message = new Api.Message({ id: 8, peerId: peer, fromId: peer, date: 1, editDate: 200, message: "release" });
    const invoke = vi.fn(async (request) => {
      if (request.className === "updates.GetDifference") {
        return isChannel
          ? { className: "updates.DifferenceEmpty", date: 200 }
          : { className: "updates.Difference", newMessages: [], otherUpdates: [{ className: "UpdateEditMessage", message }], users: [partial], chats: [], state: { pts: 101, qts: 0, date: 200 } };
      }
      return { className: "updates.ChannelDifference", newMessages: [], otherUpdates: [{ className: "UpdateEditChannelMessage", message }], users: [], chats: [partial], pts: 51, final: true };
    });
    const client = { invoke, _entityCache: { get: () => undefined } };

    const result = await recoverUpdateDifferences({
      client: client as any, accountId: "1", dialogs: [{ entity, dialog: { pts: 51 } }], chatScope: null,
    }, state.deps);

    expect(result.failedScopes).toBe(0);
    expect(state.ingest).toHaveBeenCalledWith(message, entity);
    expect(await message.getSender()).toBe(entity);
    expect(isChannel ? state.read().channels["10"] : state.read().global?.pts).toBe(isChannel ? 51 : 101);
  });

  it("skips unresolved out-of-scope peers before processing a selected private edit", async () => {
    const state = setup();
    const privateEdit = { id: 8, className: "Message", peerId: new Api.PeerUser({ userId: user.id }), date: 1, editDate: 200, message: "release" };
    const invoke = vi.fn().mockResolvedValue({
      className: "updates.Difference",
      newMessages: [
        { id: 6, className: "Message", peerId: new Api.PeerChat({ chatId: bigInt(29) }), date: 1, message: "outside scope without entity" },
        { id: 7, className: "Message", peerId: new Api.PeerChat({ chatId: bigInt(30) }), date: 1, message: "outside scope forbidden" },
      ],
      otherUpdates: [{ className: "UpdateEditMessage", message: privateEdit }],
      users: [user], chats: [new Api.ChatForbidden({ id: bigInt(30), title: "Left group" })],
      state: { pts: 103, qts: 0, date: 200 },
    });

    const result = await recoverUpdateDifferences({
      client: { invoke } as any, accountId: "1", dialogs: [{ entity: user }], chatScope: new Set(["user:20"]),
    }, state.deps);

    expect(result.failedScopes).toBe(0);
    expect(state.ingest).toHaveBeenCalledExactlyOnceWith(privateEdit, user);
    expect(state.read().global?.pts).toBe(103);
  });

  it("does not let a forbidden peer poison unrestricted global recovery", async () => {
    const state = setup();
    const privateEdit = { id: 8, className: "Message", peerId: new Api.PeerUser({ userId: user.id }), date: 1, editDate: 200, message: "release" };
    const invoke = vi.fn().mockResolvedValue({
      className: "updates.Difference", newMessages: [
        { id: 7, className: "Message", peerId: new Api.PeerChat({ chatId: bigInt(30) }), date: 1, message: "removed group" },
        privateEdit,
      ], otherUpdates: [], users: [user], chats: [new Api.ChatForbidden({ id: bigInt(30), title: "Left group" })],
      state: { pts: 102, qts: 0, date: 200 },
    });

    const result = await recoverUpdateDifferences({
      client: { invoke } as any, accountId: "1", dialogs: [{ entity: user }], chatScope: null,
    }, state.deps);

    expect(result.failedScopes).toBe(0);
    expect(state.ingest).toHaveBeenCalledExactlyOnceWith(privateEdit, user);
    expect(state.read().global?.pts).toBe(102);
  });

  it("retains the cursor when a selected peer has no entity instead of silently dropping its edit", async () => {
    const state = setup();
    const invoke = vi.fn().mockResolvedValue({
      className: "updates.Difference", newMessages: [], users: [], chats: [],
      otherUpdates: [{ className: "UpdateEditMessage", message: { id: 7, className: "Message", peerId: new Api.PeerUser({ userId: user.id }), date: 1, message: "release" } }],
      state: { pts: 101, qts: 0, date: 200 },
    });

    const result = await recoverUpdateDifferences({
      client: { invoke } as any, accountId: "1", dialogs: [], chatScope: new Set(["user:20"]),
    }, state.deps);

    expect(result.failedScopes).toBe(1);
    expect(state.ingest).not.toHaveBeenCalled();
    expect(state.read().global?.pts).toBe(100);
  });
});

it("uses the private source key when a user and channel have the same numeric ID", async () => {
  const state = setup();
  const sameIdUser = new Api.User({ id: channel.id, accessHash: bigInt(41), firstName: "Alice" });
  const privateEdit = { id: 8, className: "Message", peerId: new Api.PeerUser({ userId: sameIdUser.id }), date: 1, editDate: 200, message: "release" };
  const channelMessage = { ...privateEdit, peerId: new Api.PeerChannel({ channelId: channel.id }) };
  const invoke = vi.fn().mockResolvedValue({
    className: "updates.Difference", newMessages: [channelMessage],
    otherUpdates: [{ className: "UpdateEditMessage", message: privateEdit }], users: [sameIdUser], chats: [channel],
    state: { pts: 102, qts: 0, date: 200 },
  });
  const result = await recoverUpdateDifferences({
    client: { invoke } as any, accountId: "1", dialogs: [{ entity: sameIdUser }, { entity: channel }], chatScope: new Set(["user:10"]),
  }, state.deps);
  expect(result.savedCount).toBe(1);
  expect(state.ingest).toHaveBeenCalledExactlyOnceWith(privateEdit, sameIdUser);
  expect(invoke).toHaveBeenCalledOnce();
  expect(state.read().channels["10"]).toBe(50);
});
