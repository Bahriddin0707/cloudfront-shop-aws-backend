#!/usr/bin/env node
import "source-map-support/register";
import * as path from "path";
import * as dotenv from "dotenv";
import { App } from "aws-cdk-lib";
import { ProductServiceStack } from "../lib/product-service-stack";
import { ImportServiceStack } from "../lib/import-service-stack";
import { AuthorizationServiceStack } from "../lib/authorization-service-stack";

// Load credentials from .env (gitignored). Example:
//   Bahriddin0707=TEST_PASSWORD
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const app = new App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? "eu-west-1",
};

const NOTIFICATION_EMAIL =
  process.env.SNS_NOTIFICATION_EMAIL ?? "omonovamohigul95@gmail.com";
const BIG_PRODUCT_EMAIL =
  process.env.SNS_BIG_PRODUCT_EMAIL ?? "omonovamohigul95@gmail.com";

// ---- Extract authorizer credentials from .env -------------------------------
// Any env var whose value equals "TEST_PASSWORD" is treated as a credential
// (key = github login). This matches the Task 7 contract.
const RESERVED_KEYS = new Set([
  "CDK_DEFAULT_ACCOUNT",
  "CDK_DEFAULT_REGION",
  "SNS_NOTIFICATION_EMAIL",
  "SNS_BIG_PRODUCT_EMAIL",
]);

const credentials: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (
    typeof value === "string" &&
    value === "TEST_PASSWORD" &&
    /^[A-Za-z][A-Za-z0-9_-]*$/.test(key) &&
    !RESERVED_KEYS.has(key)
  ) {
    credentials[key] = value;
  }
}

const authStack = new AuthorizationServiceStack(
  app,
  "AuthorizationServiceStack",
  {
    env,
    description:
      "RS School AWS Course - Module 7 - Authorization Service (Basic Auth Lambda Authorizer)",
    credentials,
  }
);

const productStack = new ProductServiceStack(app, "ProductServiceStack", {
  env,
  description:
    "RS School AWS Course - Modules 3, 4 & 6 - Product Service (DDB + SQS + SNS)",
  notificationEmail: NOTIFICATION_EMAIL,
  bigProductEmail: BIG_PRODUCT_EMAIL,
  bigProductPriceThreshold: 100,
});

new ImportServiceStack(app, "ImportServiceStack", {
  env,
  description:
    "RS School AWS Course - Modules 5, 6 & 7 - Import Service (S3 -> SQS + Basic Auth)",
  catalogItemsQueue: productStack.catalogItemsQueue,
  basicAuthorizerFnArn: authStack.basicAuthorizerFn.functionArn,
});
