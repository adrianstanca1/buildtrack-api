import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const endpoint = process.env.MINIO_ENDPOINT || 'http://127.0.0.1:9000';
const accessKeyId = process.env.MINIO_ACCESS_KEY || 'buildtrack-api';
const secretAccessKey = process.env.MINIO_SECRET_KEY || 'buildtrack-minio-secret-2024';
const bucket = process.env.MINIO_BUCKET || 'buildtrack-uploads';

export const s3Client = new S3Client({
  endpoint,
  region: 'us-east-1',
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: true,
});

export const BUCKET = bucket;

export async function uploadFile(key: string, body: Buffer, contentType: string) {
  await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
  return `${endpoint}/${bucket}/${key}`;
}

export async function getSignedDownloadUrl(key: string, expiresIn = 3600) {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(s3Client, command, { expiresIn });
}

export async function deleteFile(key: string) {
  await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
