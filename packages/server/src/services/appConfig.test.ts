import { afterAll, expect, it, vi } from "vitest";
import type { createMessageMembershipTestDatabase } from "./messageMemberships.test-helpers.js";
const state=vi.hoisted(()=>({fixture:undefined as ReturnType<typeof createMessageMembershipTestDatabase>|undefined}));
vi.mock("../db/index.js",async()=>{const {createMessageMembershipTestDatabase}=await import("./messageMemberships.test-helpers.js");state.fixture=createMessageMembershipTestDatabase();return {db:state.fixture.db};});
import {db} from "../db/index.js";
import {saveAppConfig} from "./appConfig.js";
afterAll(async()=>state.fixture?.cleanup());
it("validates every configuration section before any row is persisted",async()=>{
 await expect(saveAppConfig({telegram:{apiId:12345,apiHash:"0123456789abcdef0123456789abcdef"},media:{thumbIndex:9}})).rejects.toThrow("thumbIndex");
 expect(await db.appConfig.count()).toBe(0);
 await saveAppConfig({telegram:{apiId:12345,apiHash:"0123456789abcdef0123456789abcdef"},media:{thumbIndex:2}});
 expect(await db.appConfig.count()).toBe(2);
});
