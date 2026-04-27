import * as path from "path";
import { Construct } from "constructs";
import {
  Duration,
  Stack,
  StackProps,
  CfnOutput,
  RemovalPolicy,
} from "aws-cdk-lib";
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
import {
  AttributeType,
  BillingMode,
  Table,
} from "aws-cdk-lib/aws-dynamodb";

export class ProductServiceStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // ---- DynamoDB tables (Task 4) -----------------------------------------
    const productsTable = new Table(this, "ProductsTable", {
      tableName: "products",
      partitionKey: { name: "id", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const stocksTable = new Table(this, "StocksTable", {
      tableName: "stocks",
      partitionKey: { name: "product_id", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // ---- Shared Lambda config ---------------------------------------------
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
        PRODUCTS_TABLE_NAME: productsTable.tableName,
        STOCKS_TABLE_NAME: stocksTable.tableName,
      },
    };

    // ---- Lambdas ----------------------------------------------------------
    const getProductsListFn = new NodejsFunction(this, "GetProductsListFn", {
      ...sharedLambdaProps,
      functionName: "getProductsList",
      entry: path.join(__dirname, "../src/handlers/getProductsList.ts"),
      handler: "handler",
      description: "Returns the full list of products joined with stocks (DDB)",
    });

    const getProductsByIdFn = new NodejsFunction(this, "GetProductsByIdFn", {
      ...sharedLambdaProps,
      functionName: "getProductsById",
      entry: path.join(__dirname, "../src/handlers/getProductsById.ts"),
      handler: "handler",
      description: "Returns a single product by id joined with stock (DDB)",
    });

    const createProductFn = new NodejsFunction(this, "CreateProductFn", {
      ...sharedLambdaProps,
      functionName: "createProduct",
      entry: path.join(__dirname, "../src/handlers/createProduct.ts"),
      handler: "handler",
      description: "Creates product + stock atomically via TransactWrite",
    });

    // ---- IAM --------------------------------------------------------------
    productsTable.grantReadData(getProductsListFn);
    stocksTable.grantReadData(getProductsListFn);

    productsTable.grantReadData(getProductsByIdFn);
    stocksTable.grantReadData(getProductsByIdFn);

    productsTable.grantWriteData(createProductFn);
    stocksTable.grantWriteData(createProductFn);

    // ---- API Gateway ------------------------------------------------------
    const api = new RestApi(this, "ProductServiceApi", {
      restApiName: "Product Service API",
      description: "RS School AWS Course - Product Service (Task 3 + 4)",
      endpointTypes: [EndpointType.REGIONAL],
      deployOptions: {
        stageName: "dev",
        loggingLevel: MethodLoggingLevel.INFO,
        dataTraceEnabled: false,
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });

    const productsResource = api.root.addResource("products");
    productsResource.addMethod(
      "GET",
      new LambdaIntegration(getProductsListFn, { proxy: true })
    );
    productsResource.addMethod(
      "POST",
      new LambdaIntegration(createProductFn, { proxy: true })
    );

    const productByIdResource = productsResource.addResource("{productId}");
    productByIdResource.addMethod(
      "GET",
      new LambdaIntegration(getProductsByIdFn, { proxy: true })
    );

    // ---- Outputs ----------------------------------------------------------
    new CfnOutput(this, "ApiUrl", {
      value: api.url,
      description: "Base URL of the Product Service API",
    });

    new CfnOutput(this, "ProductsEndpoint", {
      value: `${api.url}products`,
      description: "GET/POST /products endpoint",
    });

    new CfnOutput(this, "ProductsTableName", {
      value: productsTable.tableName,
    });

    new CfnOutput(this, "StocksTableName", {
      value: stocksTable.tableName,
    });
  }
}
