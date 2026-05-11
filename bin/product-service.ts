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

new ProductServiceStack(app, "ProductServiceStack", {
  env,
  description:
    "RS School AWS Course - Modules 3 & 4 (Serverless + DynamoDB) - Product Service",
});

new ImportServiceStack(app, "ImportServiceStack", {
  env,
  description:
    "RS School AWS Course - Module 5 (S3 Integration) - Import Service",
});
