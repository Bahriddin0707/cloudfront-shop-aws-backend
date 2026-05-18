import type {
  APIGatewayTokenAuthorizerEvent,
  APIGatewayAuthorizerResult,
} from "aws-lambda";

type Effect = "Allow" | "Deny";

const buildPolicy = (
  principalId: string,
  effect: Effect,
  resource: string
): APIGatewayAuthorizerResult => ({
  principalId,
  policyDocument: {
    Version: "2012-10-17",
    Statement: [
      {
        Action: "execute-api:Invoke",
        Effect: effect,
        Resource: resource,
      },
    ],
  },
});

export const handler = async (
  event: APIGatewayTokenAuthorizerEvent
): Promise<APIGatewayAuthorizerResult> => {
  console.log("basicAuthorizer event", JSON.stringify(event));

  const authToken = event.authorizationToken;

  // Missing or empty header -> API Gateway returns 401 when authorizer
  // explicitly throws "Unauthorized".
  if (!authToken) {
    throw new Error("Unauthorized");
  }

  // Expected format: "Basic <base64(login:password)>"
  const [scheme, encodedCreds] = authToken.split(" ");
  if (scheme !== "Basic" || !encodedCreds) {
    // Malformed token -> Deny -> API Gateway responds with 403.
    return buildPolicy("user", "Deny", event.methodArn);
  }

  let login = "";
  let password = "";
  try {
    const decoded = Buffer.from(encodedCreds, "base64").toString("utf-8");
    const separatorIdx = decoded.indexOf(":");
    if (separatorIdx === -1) {
      return buildPolicy("user", "Deny", event.methodArn);
    }
    login = decoded.slice(0, separatorIdx);
    password = decoded.slice(separatorIdx + 1);
  } catch (err) {
    console.error("Failed to decode Basic token", err);
    return buildPolicy("user", "Deny", event.methodArn);
  }

  const expectedPassword = process.env[login];
  const effect: Effect =
    expectedPassword !== undefined && expectedPassword === password
      ? "Allow"
      : "Deny";

  console.log("basicAuthorizer result", { login, effect });

  return buildPolicy(login || "user", effect, event.methodArn);
};
