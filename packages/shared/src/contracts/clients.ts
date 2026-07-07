import { z } from "zod";

export const clientRuntimeTypeSchema = z.enum(["web", "pwa", "desktop", "mobile"]);
export const clientPlatformSchema = z.enum(["browser", "tauri"]);
export const clientOsSchema = z.enum(["macos", "windows", "linux", "ios", "android"]);

export const clientCapabilitiesSchema = z
  .object({
    nativeNotification: z.boolean(),
    secureStorage: z.boolean(),
    openExternal: z.boolean(),
    scanQrCode: z.boolean(),
    backgroundRefresh: z.boolean(),
    tray: z.boolean(),
    appUpdater: z.boolean(),
  })
  .strict();

export const clientDeviceIdParamSchema = z.object({
  id: z.string().trim().min(1, "client id is required").max(128, "client id is too long"),
});

export const clientDeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: clientRuntimeTypeSchema,
  platform: clientPlatformSchema,
  os: clientOsSchema.optional(),
  appVersion: z.string().optional(),
  capabilities: clientCapabilitiesSchema,
  pushToken: z.string().optional(),
  lastSeenAt: z.string(),
  createdAt: z.string(),
  revokedAt: z.string().nullable().optional(),
});

export const clientDeviceListSchema = z.array(clientDeviceSchema);

export const clientDeviceRegisterInputSchema = z
  .object({
    clientId: z.string().trim().min(1, "clientId is required").max(128, "clientId is too long"),
    name: z.string().trim().min(1, "name is required").max(120, "name is too long"),
    type: clientRuntimeTypeSchema,
    platform: clientPlatformSchema,
    os: clientOsSchema.optional(),
    appVersion: z.string().trim().max(64, "appVersion is too long").optional(),
    capabilities: clientCapabilitiesSchema,
    pushToken: z.string().trim().max(500, "pushToken is too long").optional(),
  })
  .strict();

export const clientDeviceHeartbeatResponseSchema = z.object({
  success: z.boolean(),
  lastSeenAt: z.string(),
});

export const clientDeviceActionResponseSchema = z.object({
  success: z.boolean(),
});

export type ClientRuntimeType = z.infer<typeof clientRuntimeTypeSchema>;
export type ClientPlatform = z.infer<typeof clientPlatformSchema>;
export type ClientOs = z.infer<typeof clientOsSchema>;
export type ClientCapabilities = z.infer<typeof clientCapabilitiesSchema>;
export type ClientDevice = z.infer<typeof clientDeviceSchema>;
export type ClientDeviceRegisterInput = z.infer<typeof clientDeviceRegisterInputSchema>;
export type ClientDeviceHeartbeatResponse = z.infer<typeof clientDeviceHeartbeatResponseSchema>;
export type ClientDeviceActionResponse = z.infer<typeof clientDeviceActionResponseSchema>;
