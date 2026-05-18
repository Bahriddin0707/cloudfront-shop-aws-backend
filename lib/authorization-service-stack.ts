import * as path from "path";
import { Construct } from "constructs";
import { Duration, Stack, StackProps, CfnOutput } from "aws-cdk-lib";
import { Runtime, Tracing, IFunction } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { RetentionDays } from "aws-cdk-lib/aws-logs";

export interface AuthorizationServiceStackProps extends StackProps {
  /**
   * Map of credentials to expose as Lambda environment variables.
   * Key = github login, value = password (e.g. "TEST_PASSWORD").
   * Loaded from .env (see bin/product-service.ts).
   */
  readonly credentials: Record<string, string>;
}

export class AuthorizationServiceStack extends Stack {
  public readonly basicAuthorizerFn: IFunction;

  constructor(
    scope: Construct,
    id: string,
    props: AuthorizationServiceStackProps
  ) {
    super(scope, id, props);

    if (Object.keys(props.credentials).length === 0) {
      throw new Error(
        "AuthorizationServiceStack: no credentials provided. Make sure .env contains <github_login>=<password>."
      );
    }

    const basicAuthorizerFn = new NodejsFunction(this, "BasicAuthorizerFn", {
      functionName: "basicAuthorizer",
      runtime: Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: Duration.seconds(5),
      tracing: Tracing.ACTIVE,
      logRetention: RetentionDays.ONE_WEEK,
      entry: path.join(__dirname, "../src/handlers/basicAuthorizer.ts"),
      handler: "handler",
      description:
        "Lambda Authorizer that validates Basic Auth credentials against env vars",
      bundling: {
        minify: true,
        sourceMap: true,
        target: "node20",
        format: OutputFormat.CJS,
        externalModules: ["@aws-sdk/*"],
      },
      environment: {
        NODE_OPTIONS: "--enable-source-maps",
        ...props.credentials,
      },
    });

    this.basicAuthorizerFn = basicAuthorizerFn;

    new CfnOutput(this, "BasicAuthorizerFnArn", {
      value: basicAuthorizerFn.functionArn,
    });
  }
}
