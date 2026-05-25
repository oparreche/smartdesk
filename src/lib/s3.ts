import 'server-only';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './env';

const s3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
});

export type PutInput = {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
};

export async function putObject(input: PutInput): Promise<{ key: string }> {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
    }),
  );
  return { key: input.key };
}

export async function presignGet(key: string, expiresInSeconds = 900): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
    { expiresIn: expiresInSeconds },
  );
}

export async function presignPut(
  key: string,
  contentType: string,
  expiresInSeconds = 600,
): Promise<string> {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: expiresInSeconds },
  );
}

export function buildAttachmentKey(organizationId: string, ticketId: string, filename: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-120);
  return `${organizationId}/${ticketId}/${ts}-${rand}-${safeName}`;
}

export function buildKnowledgeKey(organizationId: string, filename: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-120);
  return `${organizationId}/knowledge/${ts}-${rand}-${safeName}`;
}

/** Faz download de um object como Buffer (uso interno: indexer de knowledge). */
export async function getObjectBuffer(key: string): Promise<Buffer> {
  const out = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  if (!out.Body) throw new Error('S3 object body vazio');
  // Node 18+ readable stream → Buffer
  const stream = out.Body as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  for await (const c of stream as AsyncIterable<Buffer | Uint8Array>) {
    chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  }
  return Buffer.concat(chunks);
}
