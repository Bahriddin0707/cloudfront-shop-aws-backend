import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const region = process.env.AWS_REGION ?? "us-east-1";

const baseClient = new DynamoDBClient({ region });

export const ddb = DynamoDBDocumentClient.from(baseClient, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: false,
  },
});

export const PRODUCTS_TABLE_NAME =
  process.env.PRODUCTS_TABLE_NAME ?? "products";
export const STOCKS_TABLE_NAME = process.env.STOCKS_TABLE_NAME ?? "stocks";
