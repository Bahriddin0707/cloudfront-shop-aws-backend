import * as path from "path";
import { Construct } from "constructs";
import { Duration, Stack, StackProps, CfnOutput } from "aws-cdk-lib";
import { Runtime, Tracing } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import {
  Cors,
  LambdaIntegration,
  RestApi,
  EndpointType,
  MethodLoggingLevel,
} from "aws-cdk-lib/aws-apigateway";
import { RetentionDays } from "aws-cdk-lib/aws-logs";

export class ProductServiceStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const sharedLambdaProps = {
      runtime: Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: Duration.seconds(10),
      tracing: Tracing.ACTIVE,
      logRetention: RetentionDays.ONE_WEEK,
      bundling: {
        minify: true,
        sourceMap: true,
        target: "node20",
        format: OutputFormat.CJS,
        externalModules: ["@aws-sdk/*"],
      },
      environment: {
        NODE_OPTIONS: "--enable-source-maps",
      },
    };

    const getProductsListFn = new NodejsFunction(this, "GetProductsListFn", {
      ...sharedLambdaProps,
      functionName: "getProductsList",
      entry: path.join(__dirname, "../src/handlers/getProductsList.ts"),
      handler: "handler",
      description: "Returns the full list of products (mock data)",
    });

    const getProductsByIdFn = new NodejsFunction(this, "GetProductsByIdFn", {
      ...sharedLambdaProps,
      functionName: "getProductsById",
      entry: path.join(__dirname, "../src/handlers/getProductsById.ts"),
      handler: "handler",
      description: "Returns a single product by id (mock data)",
    });

    const api = new RestApi(this, "ProductServiceApi", {
      restApiName: "Product Service API",
      description: "RS School AWS Course - Product Service (Task 3)",
      endpointTypes: [EndpointType.REGIONAL],
      deployOptions: {
        stageName: "dev",
        loggingLevel: MethodLoggingLevel.INFO,
        dataTraceEnabled: false,
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: ["GET", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });

    const productsResource = api.root.addResource("products");
    productsResource.addMethod(
      "GET",
      new LambdaIntegration(getProductsListFn, { proxy: true })
    );

    const productByIdResource = productsResource.addResource("{productId}");
    productByIdResource.addMethod(
      "GET",
      new LambdaIntegration(getProductsByIdFn, { proxy: true })
    );

    new CfnOutput(this, "ApiUrl", {
      value: api.url,
      description: "Base URL of the Product Service API",
    });

    new CfnOutput(this, "ProductsEndpoint", {
      value: `${api.url}products`,
      description: "GET /products endpoint",
    });
  }
}
