import { FastifyPluginAsync } from "fastify";
import { db } from "../db/index.js";
import { sendAppriseNotification } from "../services/notifier.js";

interface TargetBody {
  name: string;
  appriseUrl: string;
  enabled: boolean;
  filterIds: number[];
}

export const forwardTargetsRoutes: FastifyPluginAsync = async (fastify) => {
  // List targets
  fastify.get("/", async (request, reply) => {
    const targets = await db.forwardTarget.findMany({
      include: {
        filters: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    
    // Flatten filter IDs for frontend convenience
    return targets.map(t => ({
      ...t,
      filterIds: t.filters.map(f => f.id)
    }));
  });

  // Create target
  fastify.post<{ Body: TargetBody }>("/", async (request, reply) => {
    const { name, appriseUrl, enabled, filterIds } = request.body;
    
    const target = await db.forwardTarget.create({
      data: {
        name,
        appriseUrl,
        enabled,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        filters: {
          connect: filterIds.map(id => ({ id }))
        }
      },
      include: {
        filters: { select: { id: true } },
      }
    });

    return {
      ...target,
      filterIds: target.filters.map(f => f.id)
    };
  });

  // Update target
  fastify.put<{ Params: { id: string }, Body: TargetBody }>("/:id", async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const { name, appriseUrl, enabled, filterIds } = request.body;

    const target = await db.forwardTarget.update({
      where: { id },
      data: {
        name,
        appriseUrl,
        enabled,
        updatedAt: new Date().toISOString(),
        filters: {
          set: filterIds.map(fid => ({ id: fid }))
        }
      },
      include: {
        filters: { select: { id: true } },
      }
    });

    return {
      ...target,
      filterIds: target.filters.map(f => f.id)
    };
  });

  // Delete target
  fastify.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    await db.forwardTarget.delete({ where: { id } });
    return { success: true };
  });

  // Test target
  fastify.post<{ Body: { appriseUrl: string } }>("/test", async (request, reply) => {
    const { appriseUrl } = request.body;
    if (!appriseUrl) {
      throw new Error("Apprise URL is required");
    }

    const title = "[Telegram] 测试消息";
    const body = "这是一条来自 Telegram Star 的测试消息，如果您能看到此消息，说明转发通道配置成功！";

    await sendAppriseNotification([appriseUrl], title, body);
    
    return { success: true };
  });
};
