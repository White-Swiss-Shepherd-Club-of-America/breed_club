/**
 * Upload routes for certificate files and dog photos.
 *
 * - POST /certificate          — upload a certificate PDF/image to R2
 * - GET  /certificate/*        — retrieve a certificate file from R2
 * - POST /photo                — upload a dog photo (JPEG/PNG) to R2
 * - GET  /photo/*              — retrieve a dog photo from R2
 */

import { Hono } from "hono";
import type { Env } from "../lib/types.js";
import type { Database } from "../db/client.js";
import type { AuthContext } from "@breed-club/shared";
import { requireLevel } from "../middleware/rbac.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};
const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};

type Variables = {
  clubId: string;
  db: Database;
  clerkUserId: string | null;
  auth: AuthContext | null;
};

const uploadRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * POST /certificate — upload a certificate file.
 * Accepts multipart/form-data with a "file" field.
 * Returns { key } which can be stored as certificate_url.
 */
uploadRoutes.post("/certificate", requireLevel(10), async (c) => {
  const auth = c.get("auth");
  const clubId = c.get("clubId");

  if (!auth?.member) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      401
    );
  }

  const formData = await c.req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return c.json(
      { error: { code: "BAD_REQUEST", message: "No file provided" } },
      400
    );
  }

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return c.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "Invalid file type. Accepted: PDF, JPEG, PNG",
        },
      },
      400
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return c.json(
      { error: { code: "BAD_REQUEST", message: "File too large (max 10MB)" } },
      400
    );
  }

  const key = `certificates/${clubId}/${crypto.randomUUID()}.${ext}`;

  await c.env.CERTIFICATES_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: {
      uploadedBy: auth.member.id,
      originalName: file.name,
    },
  });

  return c.json({ key });
});

/**
 * GET /certificate/* — retrieve a certificate file by key.
 * No auth required — keys are unguessable UUIDs, and certificates
 * need to be openable directly in the browser (no Bearer token support).
 */
uploadRoutes.get("/certificate/*", async (c) => {
  const key = c.req.path.replace("/api/uploads/certificate/", "");

  if (!key || !key.startsWith("certificates/")) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "File not found" } },
      404
    );
  }

  const object = await c.env.CERTIFICATES_BUCKET.get(key);
  if (!object) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "File not found" } },
      404
    );
  }

  const contentType = object.httpMetadata?.contentType || "application/octet-stream";
  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Content-Disposition", "inline");
  headers.set("Cache-Control", "private, max-age=3600");
  // Allow this response to be embedded in an iframe on the same origin
  headers.set("X-Frame-Options", "SAMEORIGIN");

  return new Response(object.body, { headers });
});

/**
 * POST /photo — upload a dog photo.
 * Accepts multipart/form-data with a "file" field (JPEG/PNG only).
 * Returns { key } which can be stored as photo_url.
 */
uploadRoutes.post("/photo", requireLevel(10), async (c) => {
  const auth = c.get("auth");
  const clubId = c.get("clubId");

  if (!auth?.member) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      401
    );
  }

  const formData = await c.req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return c.json(
      { error: { code: "BAD_REQUEST", message: "No file provided" } },
      400
    );
  }

  const ext = PHOTO_TYPES[file.type];
  if (!ext) {
    return c.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "Invalid file type. Accepted: JPEG, PNG",
        },
      },
      400
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return c.json(
      { error: { code: "BAD_REQUEST", message: "File too large (max 10MB)" } },
      400
    );
  }

  const key = `photos/${clubId}/${crypto.randomUUID()}.${ext}`;

  await c.env.CERTIFICATES_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: {
      uploadedBy: auth.member.id,
      originalName: file.name,
    },
  });

  return c.json({ key });
});

/**
 * GET /photo/* — retrieve a dog photo by key.
 * No auth required — keys are unguessable UUIDs.
 */
uploadRoutes.get("/photo/*", async (c) => {
  const key = c.req.path.replace("/api/uploads/photo/", "");

  if (!key || !key.startsWith("photos/")) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "File not found" } },
      404
    );
  }

  const object = await c.env.CERTIFICATES_BUCKET.get(key);
  if (!object) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "File not found" } },
      404
    );
  }

  const contentType = object.httpMetadata?.contentType || "application/octet-stream";
  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Content-Disposition", "inline");
  headers.set("Cache-Control", "public, max-age=86400");

  return new Response(object.body, { headers });
});

/**
 * POST /logo — upload a breeder logo (JPEG/PNG, max 2MB).
 */
uploadRoutes.post("/logo", requireLevel(10), async (c) => {
  const auth = c.get("auth");
  const clubId = c.get("clubId");

  if (!auth?.member) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      401
    );
  }

  const formData = await c.req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return c.json(
      { error: { code: "BAD_REQUEST", message: "No file provided" } },
      400
    );
  }

  const ext = PHOTO_TYPES[file.type];
  if (!ext) {
    return c.json(
      { error: { code: "BAD_REQUEST", message: "Invalid file type. Accepted: JPEG, PNG" } },
      400
    );
  }

  if (file.size > 2 * 1024 * 1024) {
    return c.json(
      { error: { code: "BAD_REQUEST", message: "File too large (max 2MB)" } },
      400
    );
  }

  const key = `logos/${clubId}/${crypto.randomUUID()}.${ext}`;

  await c.env.CERTIFICATES_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { uploadedBy: auth.member.id, originalName: file.name },
  });

  return c.json({ key });
});

/**
 * GET /logo/* — retrieve a breeder logo by key.
 */
uploadRoutes.get("/logo/*", async (c) => {
  const key = c.req.path.replace("/api/uploads/logo/", "");

  if (!key || !key.startsWith("logos/")) {
    return c.json({ error: { code: "NOT_FOUND", message: "File not found" } }, 404);
  }

  const object = await c.env.CERTIFICATES_BUCKET.get(key);
  if (!object) {
    return c.json({ error: { code: "NOT_FOUND", message: "File not found" } }, 404);
  }

  const contentType = object.httpMetadata?.contentType || "application/octet-stream";
  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Content-Disposition", "inline");
  headers.set("Cache-Control", "public, max-age=86400");

  return new Response(object.body, { headers });
});

/**
 * POST /banner — upload a breeder banner image (JPEG/PNG, max 5MB).
 */
uploadRoutes.post("/banner", requireLevel(10), async (c) => {
  const auth = c.get("auth");
  const clubId = c.get("clubId");

  if (!auth?.member) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      401
    );
  }

  const formData = await c.req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return c.json(
      { error: { code: "BAD_REQUEST", message: "No file provided" } },
      400
    );
  }

  const ext = PHOTO_TYPES[file.type];
  if (!ext) {
    return c.json(
      { error: { code: "BAD_REQUEST", message: "Invalid file type. Accepted: JPEG, PNG" } },
      400
    );
  }

  if (file.size > 5 * 1024 * 1024) {
    return c.json(
      { error: { code: "BAD_REQUEST", message: "File too large (max 5MB)" } },
      400
    );
  }

  const key = `banners/${clubId}/${crypto.randomUUID()}.${ext}`;

  await c.env.CERTIFICATES_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { uploadedBy: auth.member.id, originalName: file.name },
  });

  return c.json({ key });
});

/**
 * GET /banner/* — retrieve a breeder banner by key.
 */
uploadRoutes.get("/banner/*", async (c) => {
  const key = c.req.path.replace("/api/uploads/banner/", "");

  if (!key || !key.startsWith("banners/")) {
    return c.json({ error: { code: "NOT_FOUND", message: "File not found" } }, 404);
  }

  const object = await c.env.CERTIFICATES_BUCKET.get(key);
  if (!object) {
    return c.json({ error: { code: "NOT_FOUND", message: "File not found" } }, 404);
  }

  const contentType = object.httpMetadata?.contentType || "application/octet-stream";
  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Content-Disposition", "inline");
  headers.set("Cache-Control", "public, max-age=86400");

  return new Response(object.body, { headers });
});

export { uploadRoutes };
