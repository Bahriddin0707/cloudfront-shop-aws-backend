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
import { Queue } from "aws-cdk-lib/aws-sqs";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Topic, SubscriptionFilter } from "aws-cdk-lib/aws-sns";
import {
  Subscription as SnsSubscription,
  SubscriptionProtocol,
} from "aws-cdk-lib/aws-sns";

export interface ProductServiceStackProps extends StackProps {
  /** Email for the default (all-products) SNS subscription. */
  readonly notificationEmail: string;
  /** Optional second email that only receives "big" products via filter policy. */
  readonly bigProductEmail?: string;
  /** Threshold for the filter-policy subscription (price >= this value). */
  readonly bigProductPriceThreshold?: number;
}

export class ProductServiceStack extends Stack {
  /** Exposed so other stacks (e.g. ImportServiceStack) can grant SendMessage. */
  public readonly catalogItemsQueue: Queue;

  constructor(scope: Construct, id: string, props: ProductServiceStackProps) {
    super(scope, id, props);

    const {
      notificationEmail,
      bigProductEmail,
      bigProductPriceThreshold = 100,
    } = props;

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

    // ---- SQS queue (Task 6) ----------------------------------------------
    const catalogItemsQueue = new Queue(this, "CatalogItemsQueue", {
      queueName: "catalogItemsQueue",
      visibilityTimeout: Duration.seconds(60),
      retentionPeriod: Duration.days(4),
    });
    this.catalogItemsQueue = catalogItemsQueue;

    // ---- SNS topic + subscriptions (Task 6) ------------------------------
    const createProductTopic = new Topic(this, "CreateProductTopic", {
      topicName: "createProductTopic",
      displayName: "Product created notifications",
    });

    // Default subscription: receives ALL product-created events.
    new SnsSubscription(this, "CreateProductTopicDefaultEmailSub", {
      topic: createProductTopic,
      protocol: SubscriptionProtocol.EMAIL,
      endpoint: notificationEmail,
    });

    // Filter-policy subscription: only receives "expensive" products.
    if (bigProductEmail) {
      new SnsSubscription(this, "CreateProductTopicBigProductEmailSub", {
        topic: createProductTopic,
        protocol: SubscriptionProtocol.EMAIL,
        endpoint: bigProductEmail,
        filterPolicy: {
          price: SubscriptionFilter.numericFilter({
            greaterThanOrEqualTo: bigProductPriceThreshold,
          }),
        },
      });
    }

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

    // catalogBatchProcess: SQS-triggered, creates products in batches and
    // publishes an SNS notification per created product.
    const catalogBatchProcessFn = new NodejsFunction(
      this,
      "CatalogBatchProcessFn",
      {
        ...sharedLambdaProps,
        functionName: "catalogBatchProcess",
        entry: path.join(
          __dirname,
          "../src/handlers/catalogBatchProcess.ts"
        ),
        handler: "handler",
        timeout: Duration.seconds(30),
        description:
          "SQS-triggered (batch=5): creates products in DDB and publishes SNS event",
        environment: {
          ...sharedLambdaProps.environment,
          CREATE_PRODUCT_TOPIC_ARN: createProductTopic.topicArn,
        },
      }
    );

    catalogBatchProcessFn.addEventSource(
      new SqsEventSource(catalogItemsQueue, {
        batchSize: 5,
        reportBatchItemFailures: true,
      })
    );

    // ---- IAM --------------------------------------------------------------
    productsTable.grantReadData(getProductsListFn);
    stocksTable.grantReadData(getProductsListFn);

    productsTable.grantReadData(getProductsByIdFn);
    stocksTable.grantReadData(getProductsByIdFn);

    productsTable.grantWriteData(createProductFn);
    stocksTable.grantWriteData(createProductFn);

    productsTable.grantWriteData(catalogBatchProcessFn);
    stocksTable.grantWriteData(catalogBatchProcessFn);
    createProductTopic.grantPublish(catalogBatchProcessFn);
    // SqsEventSource auto-grants Receive/Delete; explicit for clarity:
    catalogItemsQueue.grantConsumeMessages(catalogBatchProcessFn);

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

    new CfnOutput(this, "CatalogItemsQueueUrl", {
      value: catalogItemsQueue.queueUrl,
      description: "SQS queue consumed by catalogBatchProcess",
    });

    new CfnOutput(this, "CatalogItemsQueueArn", {
      value: catalogItemsQueue.queueArn,
    });

    new CfnOutput(this, "CreateProductTopicArn", {
      value: createProductTopic.topicArn,
    });
  }
}
