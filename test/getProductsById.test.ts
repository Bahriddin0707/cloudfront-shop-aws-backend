import { handler } from "../src/handlers/getProductsById";
import { products } from "../src/data/products";
import type { APIGatewayProxyEvent, Context } from "aws-lambda";

const context = {} as Context;

const makeEvent = (productId?: string): APIGatewayProxyEvent =>
  ({
    pathParameters: productId ? { productId } : null,
  } as unknown as APIGatewayProxyEvent);

describe("getProductsById handler", () => {
  it("returns 200 and product when id exists", async () => {
    const existing = products[0];
    const result = await handler(makeEvent(existing.id), context, () => undefined);
    if (!result) throw new Error("No result");

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual(existing);
  });

  it("returns 404 when product not found", async () => {
    const result = await handler(
      makeEvent("00000000-0000-0000-0000-000000000000"),
      context,
      () => undefined
    );
    if (!result) throw new Error("No result");

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ message: "Product not found" });
  });

  it("returns 400 when productId is invalid", async () => {
    const result = await handler(makeEvent("not-a-uuid"), context, () => undefined);
    if (!result) throw new Error("No result");
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when productId is missing", async () => {
    const result = await handler(makeEvent(undefined), context, () => undefined);
    if (!result) throw new Error("No result");
    expect(result.statusCode).toBe(400);
  });
});
