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
  Bucket,
  BucketEncryption,
  BlockPublicAccess,
  EventType,
  HttpMethods,
} from "aws-cdk-lib/aws-s3";
import { LambdaDestination } from "aws-cdk-lib/aws-s3-notifications";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";

const UPLOAD_PREFIX = "uploaded/";
const PARSED_PREFIX = "parsed/";

export class ImportServiceStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // ---- S3 bucket --------------------------------------------------------
    const importBucket = new Bucket(this, "ImportBucket", {
      versioned: true,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [
            HttpMethods.PUT,
            HttpMethods.GET,
            HttpMethods.HEAD,
            HttpMethods.POST,
          ],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
          exposedHeaders: ["ETag"],
          maxAge: 3000,
        },
      ],
    });

    // Make the "uploaded/" folder visible in the S3 console.
    new BucketDeployment(this, "ImportBucketUploadedFolder", {
      destinationBucket: importBucket,
      destinationKeyPrefix: UPLOAD_PREFIX,
      sources: [Source.data(".gitkeep", "")],
      retainOnDelete: false,
      prune: false,
    });

    // ---- Shared Lambda config --------------------------------------------
    const sharedLambdaProps = {
      runtime: Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: Duration.seconds(30),
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
        IMPORT_BUCKET_NAME: importBucket.bucketName,
        UPLOAD_PREFIX,
        PARSED_PREFIX,
        SIGNED_URL_TTL: "60",
      },
    };

    // ---- Lambdas ---------------------------------------------------------
    const importProductsFileFn = new NodejsFunction(
      this,
      "ImportProductsFileFn",
      {
        ...sharedLambdaProps,
        functionName: "importProductsFile",
        entry: path.join(__dirname, "../src/handlers/importProductsFile.ts"),
        handler: "handler",
        description:
          "Returns a presigned PUT URL for uploading a CSV into uploaded/",
      }
    );

    const importFileParserFn = new NodejsFunction(this, "ImportFileParserFn", {
      ...sharedLambdaProps,
      functionName: "importFileParser",
      entry: path.join(__dirname, "../src/handlers/importFileParser.ts"),
      handler: "handler",
      description:
        "S3-triggered: streams CSV, logs records, moves file to parsed/",
    });

    // ---- IAM (least privilege) -------------------------------------------
    importBucket.grantPut(importProductsFileFn);
    importBucket.grantRead(importFileParserFn);
    importBucket.grantPut(importFileParserFn);
    importBucket.grantDelete(importFileParserFn);

    // ---- S3 -> Lambda trigger on uploaded/ -------------------------------
    importBucket.addEventNotification(
      EventType.OBJECT_CREATED,
      new LambdaDestination(importFileParserFn),
      { prefix: UPLOAD_PREFIX, suffix: ".csv" }
    );

    // ---- API Gateway -----------------------------------------------------
    const api = new RestApi(this, "ImportServiceApi", {
      restApiName: "Import Service API",
      description: "RS School AWS Course - Module 5 (S3 Integration)",
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

    const importResource = api.root.addResource("import");
    importResource.addMethod(
      "GET",
      new LambdaIntegration(importProductsFileFn, { proxy: true })
    );

    // ---- Outputs ---------------------------------------------------------
    new CfnOutput(this, "ImportApiUrl", {
      value: api.url,
      description: "Base URL of the Import Service API",
    });

    new CfnOutput(this, "ImportEndpoint", {
      value: `${api.url}import`,
      description: "GET /import?name=<file>.csv -> presigned PUT URL",
    });

    new CfnOutput(this, "ImportBucketName", {
      value: importBucket.bucketName,
    });
  }
}
