import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import { handler } from "../src/handlers/getProductsById";
import type { APIGatewayProxyEvent, Context } from "aws-lambda";

const ddbMock = mockClient(DynamoDBDocumentClient);

const context = {} as Context;
const VALID_ID = "7567ec4b-b10c-48c5-9345-fc73c48a80aa";

const makeEvent = (productId?: string): APIGatewayProxyEvent =>
  ({
    pathParameters: productId ? { productId } : null,
  } as unknown as APIGatewayProxyEvent);

beforeEach(() => {
  ddbMock.reset();
});

describe("getProductsById handler", () => {
  it("returns 200 and product joined with stock count", async () => {
    ddbMock
      .on(GetCommand, { TableName: "products", Key: { id: VALID_ID } })
      .resolves({
        Item: { id: VALID_ID, title: "T", description: "D", price: 99 },
      })
      .on(GetCommand, { TableName: "stocks", Key: { product_id: VALID_ID } })
      .resolves({ Item: { product_id: VALID_ID, count: 7 } });

    const result = await handler(makeEvent(VALID_ID), context, () => undefined);
    if (!result) throw new Error("No result");

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      id: VALID_ID,
      title: "T",
      description: "D",
      price: 99,
      count: 7,
    });
  });

  it("returns 404 when product not found", async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

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

  it("returns 500 on DynamoDB error", async () => {
    ddbMock.on(GetCommand).rejects(new Error("boom"));

    const result = await handler(makeEvent(VALID_ID), context, () => undefined);
    if (!result) throw new Error("No result");
    expect(result.statusCode).toBe(500);
  });
});
