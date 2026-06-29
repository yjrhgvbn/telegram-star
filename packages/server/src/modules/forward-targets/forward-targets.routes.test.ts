import {
  DEFAULT_FORWARD_BODY_TEMPLATE,
  DEFAULT_FORWARD_TITLE_TEMPLATE,
  type ForwardTarget,
} from "@telegram-star/shared/contracts/forward-targets";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRouteTestApp, parseJson } from "../../test/routeTestUtils.js";
import { forwardTargetsRoutes } from "./forward-targets.routes.js";
import * as forwardTargetsService from "./forward-targets.service.js";

vi.mock("./forward-targets.service.js", () => {
  class ForwardTargetNotFoundError extends Error {
    constructor() {
      super("Forward target not found");
    }
  }

  return {
    ForwardTargetNotFoundError,
    createForwardTarget: vi.fn(),
    deleteForwardTarget: vi.fn(),
    listForwardTargets: vi.fn(),
    testForwardTarget: vi.fn(),
    updateForwardTarget: vi.fn(),
  };
});

function createTarget(id: number, patch: Partial<ForwardTarget> = {}): ForwardTarget {
  return {
    id,
    name: `target-${id}`,
    appriseUrl: `test://${id}`,
    enabled: true,
    filterIds: [id],
    titleTemplate: DEFAULT_FORWARD_TITLE_TEMPLATE,
    bodyTemplate: DEFAULT_FORWARD_BODY_TEMPLATE,
    createdAt: `2026-06-29T00:00:0${id}.000Z`,
    updatedAt: `2026-06-29T00:00:0${id}.000Z`,
    ...patch,
  };
}

describe("forward target routes", () => {
  beforeEach(() => {
    vi.mocked(forwardTargetsService.createForwardTarget).mockReset();
    vi.mocked(forwardTargetsService.deleteForwardTarget).mockReset();
    vi.mocked(forwardTargetsService.listForwardTargets).mockReset();
    vi.mocked(forwardTargetsService.testForwardTarget).mockReset();
    vi.mocked(forwardTargetsService.updateForwardTarget).mockReset();
  });

  it("lists forward targets with the mounted prefix", async () => {
    const targets = [createTarget(1)];
    vi.mocked(forwardTargetsService.listForwardTargets).mockResolvedValue(targets);
    const app = await createRouteTestApp((fastify) =>
      fastify.register(forwardTargetsRoutes, { prefix: "/api/forward-targets" }),
    );

    const response = await app.inject({ method: "GET", url: "/api/forward-targets" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(parseJson(response.payload)).toEqual(targets);
  });

  it("validates create and update payloads", async () => {
    const created = createTarget(2, { name: "created" });
    const updated = createTarget(2, { name: "updated", enabled: false });
    vi.mocked(forwardTargetsService.createForwardTarget).mockResolvedValue(created);
    vi.mocked(forwardTargetsService.updateForwardTarget).mockResolvedValue(updated);
    const app = await createRouteTestApp((fastify) =>
      fastify.register(forwardTargetsRoutes, { prefix: "/api/forward-targets" }),
    );

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/forward-targets",
      payload: {
        name: "created",
        appriseUrl: "mailto://user:pass@example.com",
        enabled: true,
        filterIds: [1, 2],
      },
    });
    const updateResponse = await app.inject({
      method: "PUT",
      url: "/api/forward-targets/2",
      payload: {
        name: "updated",
        appriseUrl: "mailto://user:pass@example.com",
        enabled: false,
        filterIds: [2],
      },
    });
    await app.close();

    expect(createResponse.statusCode).toBe(200);
    expect(updateResponse.statusCode).toBe(200);
    expect(forwardTargetsService.createForwardTarget).toHaveBeenCalledWith({
      name: "created",
      appriseUrl: "mailto://user:pass@example.com",
      enabled: true,
      filterIds: [1, 2],
      titleTemplate: DEFAULT_FORWARD_TITLE_TEMPLATE,
      bodyTemplate: DEFAULT_FORWARD_BODY_TEMPLATE,
    });
    expect(forwardTargetsService.updateForwardTarget).toHaveBeenCalledWith(2, {
      name: "updated",
      appriseUrl: "mailto://user:pass@example.com",
      enabled: false,
      filterIds: [2],
      titleTemplate: DEFAULT_FORWARD_TITLE_TEMPLATE,
      bodyTemplate: DEFAULT_FORWARD_BODY_TEMPLATE,
    });
  });

  it("rejects invalid create payloads", async () => {
    const app = await createRouteTestApp((fastify) =>
      fastify.register(forwardTargetsRoutes, { prefix: "/api/forward-targets" }),
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/forward-targets",
      payload: {
        name: "",
        appriseUrl: "",
        enabled: true,
        filterIds: [],
      },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(forwardTargetsService.createForwardTarget).not.toHaveBeenCalled();
  });

  it("maps not-found errors to 404 and supports delete/test actions", async () => {
    vi.mocked(forwardTargetsService.updateForwardTarget).mockRejectedValue(
      new forwardTargetsService.ForwardTargetNotFoundError(),
    );
    vi.mocked(forwardTargetsService.deleteForwardTarget).mockResolvedValue({ success: true });
    vi.mocked(forwardTargetsService.testForwardTarget).mockResolvedValue({ success: true });
    const app = await createRouteTestApp((fastify) =>
      fastify.register(forwardTargetsRoutes, { prefix: "/api/forward-targets" }),
    );

    const missingResponse = await app.inject({
      method: "PUT",
      url: "/api/forward-targets/99",
      payload: {
        name: "missing",
        appriseUrl: "mailto://user:pass@example.com",
        enabled: true,
        filterIds: [1],
      },
    });
    const deleteResponse = await app.inject({
      method: "DELETE",
      url: "/api/forward-targets/2",
    });
    const testResponse = await app.inject({
      method: "POST",
      url: "/api/forward-targets/test",
      payload: {
        appriseUrl: "mailto://user:pass@example.com",
        titleTemplate: "{{content}}",
        bodyTemplate: "{{chatTitle}}",
      },
    });
    await app.close();

    expect(missingResponse.statusCode).toBe(404);
    expect(parseJson(missingResponse.payload)).toEqual({ error: "Forward target not found" });
    expect(deleteResponse.statusCode).toBe(200);
    expect(testResponse.statusCode).toBe(200);
    expect(forwardTargetsService.deleteForwardTarget).toHaveBeenCalledWith(2);
    expect(forwardTargetsService.testForwardTarget).toHaveBeenCalledWith({
      appriseUrl: "mailto://user:pass@example.com",
      titleTemplate: "{{content}}",
      bodyTemplate: "{{chatTitle}}",
    });
  });
});
