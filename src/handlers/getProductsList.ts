import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
} from "aws-lambda";
import { getAllProducts } from "../services/productService";
import { buildResponse } from "../utils/response";

export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log("getProductsList invoked", { event });
  try {
    const products = await getAllProducts();
    return buildResponse(200, products);
  } catch (error) {
    console.error("getProductsList error", error);
    return buildResponse(500, { message: "Internal server error" });
  }
};
