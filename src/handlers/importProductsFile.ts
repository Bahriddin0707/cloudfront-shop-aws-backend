import type {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
} from "aws-lambda";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { buildResponse } from "../utils/response";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const BUCKET = process.env.IMPORT_BUCKET_NAME ?? "";
const UPLOAD_PREFIX = process.env.UPLOAD_PREFIX ?? "uploaded/";
const SIGNED_URL_TTL = Number(process.env.SIGNED_URL_TTL ?? "60");

const s3 = new S3Client({ region: REGION });

const isValidName = (name: string): boolean => {
  if (!name || name.length > 200) return false;
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return false;
  if (name.includes("..")) return false;
  return name.toLowerCase().endsWith(".csv");
};

export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log("importProductsFile invoked", { event });

  try {
    const name = event.queryStringParameters?.name?.trim();

    if (!name) {
      return buildResponse(400, { message: "Query parameter 'name' is required" });
    }
    if (!isValidName(name)) {
      return buildResponse(400, {
        message:
          "Invalid 'name'. Must be a .csv file, only [A-Za-z0-9._-] allowed.",
      });
    }
    if (!BUCKET) {
      return buildResponse(500, { message: "Server misconfigured: bucket name missing" });
    }

    const key = `${UPLOAD_PREFIX}${name}`;
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: "text/csv",
    });

    const signedUrl = await getSignedUrl(s3, command, {
      expiresIn: SIGNED_URL_TTL,
    });

    console.log("Generated presigned URL", { key, expiresIn: SIGNED_URL_TTL });

    return buildResponse(200, signedUrl);
  } catch (err) {
    console.error("importProductsFile error", err);
    return buildResponse(500, { message: "Internal Server Error" });
  }
};
