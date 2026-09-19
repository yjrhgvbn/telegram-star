import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { createMessageMembershipTestDatabase } from "./messageMemberships.test-helpers.js";
const state = vi.hoisted(() => ({ fixture: undefined as ReturnType<typeof createMessageMembershipTestDatabase> | undefined }));
vi.mock("../db/index.js", async () => {
  const { createMessageMembershipTestDatabase } = await import("./messageMemberships.test-helpers.js");
  state.fixture = createMessageMembershipTestDatabase();
  return { db: state.fixture.db };
});
import { db } from "../db/index.js";
import { createNotificationOutboxWorker, enqueueMatchedMessage } from "./notificationOutbox.js";
import { persistMessageForFilters } from "./telegram/messagePersistence.js";
import { withMessageMembershipTransaction } from "./messageMemberships.js";
const date = new Date().toISOString();
const data = { chatId:"1", telegramMessageId:42, chatTitle:"Private chat", content:"release", messageDate:date, createdAt:date };
const matches = [{filterId:1, matchedKeyword:"release"}];
beforeEach(async () => {
  await db.notificationOutbox.deleteMany(); await db.forwardTarget.deleteMany();
  await db.message.deleteMany(); await db.filter.deleteMany();
  await db.filter.create({data:{id:1,name:"Rule",conditions:JSON.stringify([{type:"keyword",values:["release"]}]),createdAt:date,updatedAt:date}});
  await db.forwardTarget.create({data:{id:1,name:"Target",appriseUrl:"test://audit",createdAt:date,updatedAt:date,filters:{connect:{id:1}}}});
});
afterAll(async () => state.fixture?.cleanup());

describe("durable notification delivery", () => {
  it("atomically queues once for automatic ingestion; duplicate and manual ingestion do not resend", async () => {
    const first = await persistMessageForFilters(data,matches,"automatic",{notify:true});
    expect(first.notifyTargetCount).toBe(1);
    expect(await db.notificationOutbox.count()).toBe(1);
    await persistMessageForFilters(data,matches,"automatic",{notify:true});
    await persistMessageForFilters({...data,telegramMessageId:43},matches,"manual",{notify:true});
    expect(await db.notificationOutbox.count()).toBe(1);
  });
  it("rolls back both the message and its notification when the transaction fails", async () => {
    await expect(withMessageMembershipTransaction(async tx => {
      const row = await tx.message.create({data});
      await enqueueMatchedMessage(tx,{rowId:row.id,messageKey:"1:42",filterId:1,filterName:"Rule",matchedKeyword:"release",chatTitle:"Private",senderName:"User",senderId:"2",content:"release",messageDate:date,telegramLink:""});
      throw new Error("transaction aborted");
    })).rejects.toThrow("transaction aborted");
    expect(await db.message.count()).toBe(0);
    expect(await db.notificationOutbox.count()).toBe(0);
  });
  it("retries failed sends and recovers a previously leased task after worker restart", async () => {
    await persistMessageForFilters(data,matches,"automatic",{notify:true});
    let clock = new Date(Date.now()+1_000);
    const send = vi.fn().mockRejectedValueOnce(new Error("network unavailable")).mockResolvedValue(undefined);
    const worker = createNotificationOutboxWorker({send,now:()=>clock});
    await worker.runOnce();
    const retry = await db.notificationOutbox.findFirstOrThrow();
    expect(retry).toMatchObject({status:"pending",attempts:1});
    await worker.runOnce(); expect(send).toHaveBeenCalledTimes(1);
    clock = retry.nextAttemptAt;
    await db.notificationOutbox.update({where:{id:retry.id},data:{status:"processing",leaseToken:"dead-worker",leaseUntil:new Date(clock.getTime()-1)}});
    const restarted = createNotificationOutboxWorker({send,now:()=>clock});
    await restarted.runOnce();
    expect(send).toHaveBeenCalledTimes(2);
    expect(await db.notificationOutbox.findFirst()).toMatchObject({status:"sent",attempts:2,title:"",body:""});
  });
  it("bounds retry attempts and skips disabled destinations", async () => {
    await persistMessageForFilters(data,matches,"automatic",{notify:true});
    let clock = new Date(Date.now()+1_000);
    const send = vi.fn().mockRejectedValue(new Error("offline"));
    const worker = createNotificationOutboxWorker({send,now:()=>clock});
    for (let i=0;i<6;i++) {
      await worker.runOnce();
      clock = new Date((await db.notificationOutbox.findFirstOrThrow()).nextAttemptAt.getTime()+1);
    }
    expect(send).toHaveBeenCalledTimes(5);
    expect(await db.notificationOutbox.findFirst()).toMatchObject({status:"failed",attempts:5});
    await persistMessageForFilters({...data,telegramMessageId:43},matches,"automatic",{notify:true});
    await db.forwardTarget.update({where:{id:1},data:{enabled:false}});
    await worker.runOnce();
    expect(send).toHaveBeenCalledTimes(5);
    expect(await db.notificationOutbox.findFirst({where:{messageKey:"1:43"}})).toMatchObject({status:"cancelled"});
  });
});
