import type { S3Event, S3Handler } from "aws-lambda";
import { Readable } from "stream";
import {
  S3Client,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import csvParser = require("csv-parser");

const REGION = process.env.AWS_REGION ?? "us-east-1";
const UPLOAD_PREFIX = process.env.UPLOAD_PREFIX ?? "uploaded/";
const PARSED_PREFIX = process.env.PARSED_PREFIX ?? "parsed/";

const s3 = new S3Client({ region: REGION });

const parseCsvStream = (stream: Readable): Promise<number> =>
  new Promise((resolve, reject) => {
    let count = 0;
    stream
      .pipe(csvParser())
      .on("data", (record: Record<string, string>) => {
        count += 1;
        console.log("CSV record", record);
      })
      .on("end", () => resolve(count))
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

      const count = await parseCsvStream(obj.Body);
      console.log("Finished parsing", { key, records: count });

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
