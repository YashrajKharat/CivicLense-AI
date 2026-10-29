import { createClient } from "@supabase/supabase-js";
import { HttpError } from "../middleware/errors.js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Configurable, because the bucket you create by hand rarely matches the name
// hardcoded in a repo — and a mismatch surfaced as an unexplained 502.
const BUCKET = process.env.STORAGE_BUCKET || "complaint-media";

/** Uploads a buffer and returns { path, url }. Paths are namespaced by complaint. */
export async function uploadImage({ buffer, mimeType, prefix, role = "report" }) {
  const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  const path = `${prefix}/${role}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: mimeType, upsert: false });

  if (error) {
    throw new HttpError(502, "The photo could not be saved.", {
      bucket: BUCKET,
      cause: error.message,
      hint: /not found|does not exist/i.test(error.message)
        ? `No Supabase storage bucket named "${BUCKET}". Create it, or set STORAGE_BUCKET in server/.env to the name you already have.`
        : undefined,
    });
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

/** Signed URL for private media — used for anything under review. */
export async function signedUrl(path, seconds = 3600) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, seconds);
  if (error) return null;
  return data.signedUrl;
}

/** Fetches an object back as base64 so it can be sent to the vision model. */
export async function downloadAsBase64(path) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw new HttpError(502, "The photo could not be read.");
  const buffer = Buffer.from(await data.arrayBuffer());
  return { base64: buffer.toString("base64"), mimeType: data.type || "image/jpeg" };
}
