import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
} from "aws-lambda";
import { createProduct } from "../services/productService";
import { buildResponse } from "../utils/response";

interface CreateProductBody {
  title?: unknown;
  description?: unknown;
  price?: unknown;
  count?: unknown;
}

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

const isNonNegativeNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

const isNonNegativeInteger = (v: unknown): v is number =>
  isNonNegativeNumber(v) && Number.isInteger(v);

export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log("createProduct invoked", { event });
  try {
    if (!event.body) {
      return buildResponse(400, { message: "Request body is required" });
    }

    let parsed: CreateProductBody;
    try {
      parsed = JSON.parse(event.body) as CreateProductBody;
    } catch {
      return buildResponse(400, { message: "Invalid JSON in request body" });
    }

    const { title, description, price, count } = parsed;

    if (!isNonEmptyString(title)) {
      return buildResponse(400, { message: "'title' must be a non-empty string" });
    }
    if (description !== undefined && typeof description !== "string") {
      return buildResponse(400, { message: "'description' must be a string" });
    }
    if (!isNonNegativeNumber(price)) {
      return buildResponse(400, { message: "'price' must be a non-negative number" });
    }
    if (!isNonNegativeInteger(count)) {
      return buildResponse(400, { message: "'count' must be a non-negative integer" });
    }

    const product = await createProduct({
      title: title.trim(),
      description: typeof description === "string" ? description : "",
      price,
      count,
    });

    return buildResponse(201, product);
  } catch (error) {
    console.error("createProduct error", error);
    return buildResponse(500, { message: "Internal server error" });
  }
};
