import type { S3Event, S3Handler } from "aws-lambda";
import { Readable } from "stream";
import {
  S3Client,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import {
  SQSClient,
  SendMessageBatchCommand,
  SendMessageBatchRequestEntry,
} from "@aws-sdk/client-sqs";
import csvParser = require("csv-parser");

const REGION = process.env.AWS_REGION ?? "us-east-1";
const UPLOAD_PREFIX = process.env.UPLOAD_PREFIX ?? "uploaded/";
const PARSED_PREFIX = process.env.PARSED_PREFIX ?? "parsed/";
const QUEUE_URL = process.env.CATALOG_ITEMS_QUEUE_URL ?? "";

const SQS_BATCH_LIMIT = 10;

const s3 = new S3Client({ region: REGION });
const sqs = new SQSClient({ region: REGION });

const sendBatchToSqs = async (
  rows: Array<Record<string, string>>
): Promise<void> => {
  if (!QUEUE_URL) {
    throw new Error("CATALOG_ITEMS_QUEUE_URL env var is not configured");
  }
  if (rows.length === 0) return;

  for (let i = 0; i < rows.length; i += SQS_BATCH_LIMIT) {
    const chunk = rows.slice(i, i + SQS_BATCH_LIMIT);
    const entries: SendMessageBatchRequestEntry[] = chunk.map((row, idx) => ({
      Id: `${i + idx}`,
      MessageBody: JSON.stringify(row),
    }));
    const result = await sqs.send(
      new SendMessageBatchCommand({
        QueueUrl: QUEUE_URL,
        Entries: entries,
      })
    );
    if (result.Failed && result.Failed.length > 0) {
      throw new Error(
        `SQS batch had failures: ${JSON.stringify(result.Failed)}`
      );
    }
  }
};

const collectCsvRows = (
  stream: Readable
): Promise<Array<Record<string, string>>> =>
  new Promise((resolve, reject) => {
    const rows: Array<Record<string, string>> = [];
    stream
      .pipe(csvParser())
      .on("data", (record: Record<string, string>) => {
        rows.push(record);
      })
      .on("end", () => resolve(rows))
      .on("error", (err: Error) => reject(err));
  });

const moveToParsed = async (bucket: string, sourceKey: string): Promise<void> => {
  if (!sourceKey.startsWith(UPLOAD_PREFIX)) return;
  const fileName = sourceKey.substring(UPLOAD_PREFIX.length);
  const targetKey = `${PARSED_PREFIX}${fileName}`;

  await s3.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: encodeURIComponent(`${bucket}/${sourceKey}`),
      Key: targetKey,
    })
  );
  console.log("Copied", { from: sourceKey, to: targetKey });

  await s3.send(
    new DeleteObjectCommand({ Bucket: bucket, Key: sourceKey })
  );
  console.log("Deleted source", { key: sourceKey });
};

export const handler: S3Handler = async (event: S3Event): Promise<void> => {
  console.log("importFileParser invoked", { records: event.Records.length });

  const failures: Array<{ key: string; error: string }> = [];

  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

    if (!key.startsWith(UPLOAD_PREFIX)) {
      console.log("Skipping non-upload key", { key });
      continue;
    }

    try {
      console.log("Processing object", { bucket, key });
      const obj = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: key })
      );

      if (!obj.Body || !(obj.Body instanceof Readable)) {
        throw new Error("S3 object Body is not a Readable stream");
      }

      const rows = await collectCsvRows(obj.Body);
      console.log("Parsed CSV", { key, rowCount: rows.length });

      await sendBatchToSqs(rows);
      console.log("Pushed rows to SQS", { key, count: rows.length });

      await moveToParsed(bucket, key);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Failed to process record", { key, error: message });
      failures.push({ key, error: message });
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Failed to process ${failures.length} record(s): ${JSON.stringify(failures)}`
    );
  }
};
