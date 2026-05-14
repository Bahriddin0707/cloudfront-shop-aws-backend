#!/usr/bin/env node
import "source-map-support/register";
import { App } from "aws-cdk-lib";
import { ProductServiceStack } from "../lib/product-service-stack";
import { ImportServiceStack } from "../lib/import-service-stack";

const app = new App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? "eu-west-1",
};

const NOTIFICATION_EMAIL =
  process.env.SNS_NOTIFICATION_EMAIL ?? "omonovamohigul95@gmail.com";
const BIG_PRODUCT_EMAIL =
  process.env.SNS_BIG_PRODUCT_EMAIL ?? "omonovamohigul95@gmail.com";

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
    "RS School AWS Course - Modules 5 & 6 - Import Service (S3 -> SQS)",
  catalogItemsQueue: productStack.catalogItemsQueue,
});
