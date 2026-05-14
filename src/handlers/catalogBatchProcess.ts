import type { SQSEvent, SQSHandler, SQSRecord } from "aws-lambda";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { createProduct, CreateProductInput } from "../services/productService";
import { AvailableProduct } from "../types/product";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const TOPIC_ARN = process.env.CREATE_PRODUCT_TOPIC_ARN ?? "";

const sns = new SNSClient({ region: REGION });

interface RawCsvRow {
  title?: unknown;
  description?: unknown;
  price?: unknown;
  count?: unknown;
}

const parseRow = (raw: RawCsvRow): CreateProductInput => {
  const title =
    typeof raw.title === "string" ? raw.title.trim() : String(raw.title ?? "").trim();
  const description =
    typeof raw.description === "string" ? raw.description : String(raw.description ?? "");
  const price = Number(raw.price);
  const count = Number(raw.count);

  if (!title) {
    throw new Error("Invalid row: 'title' must be a non-empty string");
  }
  if (!Number.isFinite(price) || price < 0) {
    throw new Error(`Invalid row: 'price' must be a non-negative number (got ${raw.price})`);
  }
  if (!Number.isFinite(count) || count < 0 || !Number.isInteger(count)) {
    throw new Error(`Invalid row: 'count' must be a non-negative integer (got ${raw.count})`);
  }

  return { title, description, price, count };
};

const parseRecord = (record: SQSRecord): CreateProductInput => {
  let parsed: RawCsvRow;
  try {
    parsed = JSON.parse(record.body) as RawCsvRow;
  } catch (err) {
    throw new Error(`Invalid JSON in SQS message body: ${record.body}`);
  }
  return parseRow(parsed);
};

const publishCreatedEvent = async (product: AvailableProduct): Promise<void> => {
  if (!TOPIC_ARN) {
    console.warn("CREATE_PRODUCT_TOPIC_ARN is not configured; skipping SNS publish");
    return;
  }
  await sns.send(
    new PublishCommand({
      TopicArn: TOPIC_ARN,
      Subject: "New product created",
      Message: JSON.stringify(product),
      MessageAttributes: {
        price: { DataType: "Number", StringValue: String(product.price) },
        count: { DataType: "Number", StringValue: String(product.count) },
        title: { DataType: "String", StringValue: product.title },
      },
    })
  );
};

export const handler: SQSHandler = async (event: SQSEvent): Promise<void> => {
  console.log("catalogBatchProcess invoked", { records: event.Records.length });

  const created: AvailableProduct[] = [];
  const failures: Array<{ messageId: string; error: string }> = [];

  for (const record of event.Records) {
    try {
      const input = parseRecord(record);
      const product = await createProduct(input);
      console.log("Product created", { id: product.id, title: product.title });
      created.push(product);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Failed to process SQS record", {
        messageId: record.messageId,
        error: message,
      });
      failures.push({ messageId: record.messageId, error: message });
    }
  }

  for (const product of created) {
    try {
      await publishCreatedEvent(product);
      console.log("SNS event published", { id: product.id });
    } catch (err) {
      console.error("Failed to publish SNS event", {
        id: product.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `catalogBatchProcess: ${failures.length} record(s) failed: ${JSON.stringify(failures)}`
    );
  }
};
