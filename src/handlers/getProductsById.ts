import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
} from "aws-lambda";
import { getProductById } from "../services/productService";
import { buildResponse } from "../utils/response";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log("getProductsById invoked", { event });
  try {
    const productId = event.pathParameters?.productId;

    if (!productId || !UUID_REGEX.test(productId)) {
      return buildResponse(400, { message: "Invalid product id" });
    }

    const product = await getProductById(productId);

    if (!product) {
      return buildResponse(404, { message: "Product not found" });
    }

    return buildResponse(200, product);
  } catch (error) {
    console.error("getProductsById error", error);
    return buildResponse(500, { message: "Internal server error" });
  }
};
