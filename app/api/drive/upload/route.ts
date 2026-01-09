import { NextResponse } from "next/server";
import { google } from "googleapis";
import { Readable } from "stream";
import sharp from "sharp";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DOC_BYTES = 10 * 1024 * 1024;
const IMAGE_COMPRESS_THRESHOLD_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const DEFAULT_FOLDER_ID = "1_fJnhPxPQ43rrbe3iZX8-eGNN-crgQd";

const IMAGE_MIME_PREFIX = "image/";

type Compressed = {
  buffer: Buffer;
  mimeType: string;
  originalSize: number;
};

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const oauth = new google.auth.OAuth2(clientId, clientSecret);
  oauth.setCredentials({ refresh_token: refreshToken });
  return oauth;
}

async function compressImage(
  buffer: Buffer,
  mimeType: string,
  originalSize: number
): Promise<Compressed> {
  const image = sharp(buffer);
  const meta = await image.metadata();
  const resized = image.resize({
    width: 2048,
    height: 2048,
    fit: "inside",
    withoutEnlargement: true,
  });
  const format = meta.format ?? "";
  const quality = 80;

  let output: Buffer | null = null;
  let outputMime = mimeType;

  if (format === "jpeg" || format === "jpg") {
    output = await resized.jpeg({ quality, mozjpeg: true }).toBuffer();
    outputMime = "image/jpeg";
  } else if (format === "png") {
    output = await resized.png({ compressionLevel: 9 }).toBuffer();
    outputMime = "image/png";
  } else if (format === "webp") {
    output = await resized.webp({ quality }).toBuffer();
    outputMime = "image/webp";
  } else if (format === "avif") {
    output = await resized.avif({ quality: 50 }).toBuffer();
    outputMime = "image/avif";
  } else if (format === "heif" || format === "heic") {
    output = await resized.heif({ quality: 60 }).toBuffer();
    outputMime = "image/heif";
  }

  if (!output) {
    return { buffer, mimeType, originalSize };
  }

  if (output.length > IMAGE_COMPRESS_THRESHOLD_BYTES) {
    if (outputMime === "image/jpeg") {
      output = await resized.jpeg({ quality: 70, mozjpeg: true }).toBuffer();
    } else if (outputMime === "image/webp") {
      output = await resized.webp({ quality: 70 }).toBuffer();
    } else if (outputMime === "image/avif") {
      output = await resized.avif({ quality: 40 }).toBuffer();
    } else if (outputMime === "image/heif") {
      output = await resized.heif({ quality: 50 }).toBuffer();
    }
  }

  return { buffer: output, mimeType: outputMime, originalSize };
}

export async function POST(request: Request) {
  const form = await request.formData();
  const taskId = String(form.get("task_id") ?? "").trim();
  const displayName = String(form.get("display_name") ?? "").trim();
  const file = form.get("file");

  if (!taskId) {
    return NextResponse.json({ ok: false, error: "missing_task_id" }, { status: 400 });
  }

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "missing_file" }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData.user) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }

  const { data: task, error: taskErr } = await supabase
    .from("project_tasks")
    .select("id, org_id, unit_id")
    .eq("id", taskId)
    .maybeSingle();

  if (taskErr || !task) {
    return NextResponse.json({ ok: false, error: "task_not_found" }, { status: 404 });
  }

  if (!task.org_id || !task.unit_id) {
    return NextResponse.json({ ok: false, error: "task_missing_org_unit" }, { status: 400 });
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());
  const originalSize = inputBuffer.byteLength;
  const isImage = file.type.startsWith(IMAGE_MIME_PREFIX);

  if (!isImage && originalSize > MAX_DOC_BYTES) {
    return NextResponse.json({ ok: false, error: "file_too_large" }, { status: 413 });
  }

  let buffer = inputBuffer;
  let uploadMimeType = file.type || "application/octet-stream";
  let finalSize = originalSize;
  let originalSizeBytes = originalSize;

  if (isImage && originalSize > IMAGE_COMPRESS_THRESHOLD_BYTES) {
    const compressed = await compressImage(inputBuffer, uploadMimeType, originalSize);
    buffer = compressed.buffer;
    uploadMimeType = compressed.mimeType;
    finalSize = buffer.byteLength;
    originalSizeBytes = compressed.originalSize;

    if (finalSize > MAX_IMAGE_BYTES) {
      return NextResponse.json({ ok: false, error: "image_too_large" }, { status: 413 });
    }
  }

  const oauth = getOAuthClient();
  if (!oauth) {
    return NextResponse.json({ ok: false, error: "missing_google_oauth" }, { status: 500 });
  }

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID;
  const drive = google.drive({ version: "v3", auth: oauth });
  const driveRes = await drive.files.create({
    requestBody: {
      name: displayName || file.name,
      parents: [folderId],
    },
    media: {
      mimeType: uploadMimeType,
      body: Readable.from(buffer),
    },
    fields: "id,name,mimeType,webViewLink,thumbnailLink,modifiedTime,size",
  });

  const driveFile = driveRes.data;
  if (!driveFile.id) {
    return NextResponse.json({ ok: false, error: "drive_upload_failed" }, { status: 502 });
  }

  const insertPayload = {
    name: (driveFile.name ?? displayName) || file.name,
    mime_type: driveFile.mimeType ?? uploadMimeType,
    web_view_link: driveFile.webViewLink ?? "",
    thumbnail_link: driveFile.thumbnailLink ?? null,
    drive_file_id: driveFile.id,
    modified_time: driveFile.modifiedTime ?? new Date().toISOString(),
    uploaded_by: authData.user.id,
    project_task_id: taskId,
    org_id: task.org_id,
    unit_id: task.unit_id,
    file_size_bytes: finalSize,
    original_size_bytes: originalSizeBytes,
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("drive_items")
    .insert(insertPayload)
    .select("id, project_task_id, name, web_view_link, thumbnail_link, mime_type")
    .maybeSingle();

  if (insertErr) {
    return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    item: inserted ?? {
      id: driveFile.id,
      project_task_id: taskId,
      name: insertPayload.name,
      web_view_link: insertPayload.web_view_link,
      thumbnail_link: insertPayload.thumbnail_link,
      mime_type: insertPayload.mime_type,
    },
  });
}
