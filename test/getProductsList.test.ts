import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { handler } from "../src/handlers/getProductsList";
import type { APIGatewayProxyEvent, Context } from "aws-lambda";

const ddbMock = mockClient(DynamoDBDocumentClient);

const event = {} as APIGatewayProxyEvent;
const context = {} as Context;

beforeEach(() => {
  ddbMock.reset();
});

describe("getProductsList handler", () => {
  it("returns 200 and products joined with stock counts", async () => {
    ddbMock
      .on(ScanCommand, { TableName: "products" })
      .resolves({
        Items: [
          { id: "p1", title: "T1", description: "D1", price: 10 },
          { id: "p2", title: "T2", description: "D2", price: 20 },
        ],
      })
      .on(ScanCommand, { TableName: "stocks" })
      .resolves({
        Items: [
          { product_id: "p1", count: 5 },
          { product_id: "p2", count: 0 },
        ],
      });

    const result = await handler(event, context, () => undefined);
    if (!result) throw new Error("No result");

    expect(result.statusCode).toBe(200);
    expect(result.headers?.["Access-Control-Allow-Origin"]).toBe("*");
    const body = JSON.parse(result.body);
    expect(body).toHaveLength(2);
    expect(body).toContainEqual({
      id: "p1",
      title: "T1",
      description: "D1",
      price: 10,
      count: 5,
    });
  });

  it("returns 500 on DynamoDB error", async () => {
    ddbMock.on(ScanCommand).rejects(new Error("boom"));

    const result = await handler(event, context, () => undefined);
    if (!result) throw new Error("No result");
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ message: "Internal server error" });
  });
});
