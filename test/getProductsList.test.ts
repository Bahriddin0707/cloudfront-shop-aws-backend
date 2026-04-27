import { handler } from "../src/handlers/getProductsList";
import { products } from "../src/data/products";
import type { APIGatewayProxyEvent, Context } from "aws-lambda";

const event = {} as APIGatewayProxyEvent;
const context = {} as Context;

describe("getProductsList handler", () => {
  it("returns 200 and the full list of products", async () => {
    const result = await handler(event, context, () => undefined);
    if (!result) throw new Error("No result");

    expect(result.statusCode).toBe(200);
    expect(result.headers?.["Access-Control-Allow-Origin"]).toBe("*");
    const body = JSON.parse(result.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(products.length);
    expect(body[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        title: expect.any(String),
        price: expect.any(Number),
        count: expect.any(Number),
      })
    );
  });
});
