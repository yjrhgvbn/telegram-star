import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(()=>({client:null as any}));
vi.mock("./telegram/client.js",()=>({getClient:()=>state.client,isClientConnected:()=>Boolean(state.client)}));
vi.mock("./telegram/dialogEntityCache.js",()=>({getDialogEntityMap:async()=>new Map([["1",{}]])}));
vi.mock("../config.js",()=>({appConfig:{media:{thumbIndex:1}}}));
import { clearMediaCache,getThumbBuffer } from "./mediaCache.js";
function client(download:()=>Promise<Buffer>) {
 return {getMessages:vi.fn().mockResolvedValue([{media:{className:"MessageMediaPhoto",photo:{sizes:[{className:"PhotoSize",type:"m",size:100}]}}}]),downloadMedia:vi.fn(download)};
}
beforeEach(()=>{state.client=null;clearMediaCache();});
describe("thumbnail account isolation",()=>{
 it("cannot serve a cached thumbnail after logout or to another account",async()=>{
  const a=client(async()=>Buffer.from("a"));const b=client(async()=>Buffer.from("b"));
  state.client=a; expect((await getThumbBuffer("1",42))?.buffer.toString()).toBe("a");
  state.client=null;expect(await getThumbBuffer("1",42)).toBeNull();
  state.client=b;expect((await getThumbBuffer("1",42))?.buffer.toString()).toBe("b");
  expect(b.downloadMedia).toHaveBeenCalledOnce();
 });
 it("does not reuse old pending work or repopulate a cleared cache after switching accounts",async()=>{
  let finish!:(value:Buffer)=>void;
  const a=client(()=>new Promise(resolve=>{finish=resolve;}));const b=client(async()=>Buffer.from("b"));
  state.client=a;const old=getThumbBuffer("1",42);
  await vi.waitFor(()=>expect(a.downloadMedia).toHaveBeenCalledOnce());
  clearMediaCache();state.client=b;
  expect((await getThumbBuffer("1",42))?.buffer.toString()).toBe("b");
  finish(Buffer.from("a"));expect(await old).toBeNull();
  expect((await getThumbBuffer("1",42))?.buffer.toString()).toBe("b");
 });
});
