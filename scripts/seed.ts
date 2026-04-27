/**
 * Seed script — populates products & stocks DynamoDB tables with mock data.
 *
 * Usage:
 *   npm run seed
 *   # or
 *   PRODUCTS_TABLE_NAME=products STOCKS_TABLE_NAME=stocks AWS_REGION=us-east-1 \
 *     npx ts-node scripts/seed.ts
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { products as seedData } from "../src/data/products";

const region = process.env.AWS_REGION ?? "us-east-1";
const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE_NAME ?? "products";
const STOCKS_TABLE = process.env.STOCKS_TABLE_NAME ?? "stocks";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const seed = async () => {
  console.log(`Seeding ${seedData.length} products into:`);
  console.log(`  region:       ${region}`);
  console.log(`  products:     ${PRODUCTS_TABLE}`);
  console.log(`  stocks:       ${STOCKS_TABLE}`);

  const productPuts = seedData.map((p) => ({
    PutRequest: {
      Item: {
        id: p.id,
        title: p.title,
        description: p.description,
        price: p.price,
      },
    },
  }));

  const stockPuts = seedData.map((p) => ({
    PutRequest: {
      Item: { product_id: p.id, count: p.count },
    },
  }));

  for (const batch of chunk(productPuts, 25)) {
    await ddb.send(
      new BatchWriteCommand({ RequestItems: { [PRODUCTS_TABLE]: batch } })
    );
  }
  console.log(`✔ wrote ${productPuts.length} items to ${PRODUCTS_TABLE}`);

  for (const batch of chunk(stockPuts, 25)) {
    await ddb.send(
      new BatchWriteCommand({ RequestItems: { [STOCKS_TABLE]: batch } })
    );
  }
  console.log(`✔ wrote ${stockPuts.length} items to ${STOCKS_TABLE}`);

  console.log("Done.");
};

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
