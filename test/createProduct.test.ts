import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { handler } from "../src/handlers/createProduct";
import type { APIGatewayProxyEvent, Context } from "aws-lambda";

const ddbMock = mockClient(DynamoDBDocumentClient);
const context = {} as Context;

const makeEvent = (body: unknown, raw = false): APIGatewayProxyEvent =>
  ({
    body: raw ? (body as string) : body === undefined ? null : JSON.stringify(body),
  } as unknown as APIGatewayProxyEvent);

beforeEach(() => {
  ddbMock.reset();
});

describe("createProduct handler", () => {
  const validBody = {
    title: "New Product",
    description: "Desc",
    price: 99,
    count: 3,
  };

  it("returns 201 and the created product on success", async () => {
    ddbMock.on(TransactWriteCommand).resolves({});

    const result = await handler(makeEvent(validBody), context, () => undefined);
    if (!result) throw new Error("No result");

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body).toEqual(
      expect.objectContaining({
        title: "New Product",
        description: "Desc",
        price: 99,
        count: 3,
      })
    );
    expect(typeof body.id).toBe("string");
    expect(body.id.length).toBeGreaterThan(0);
  });

  it("returns 400 when body is missing", async () => {
    const result = await handler(makeEvent(undefined), context, () => undefined);
    if (!result) throw new Error("No result");
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 on invalid JSON", async () => {
    const result = await handler(makeEvent("{not-json", true), context, () => undefined);
    if (!result) throw new Error("No result");
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when title is missing", async () => {
    const result = await handler(
      makeEvent({ ...validBody, title: "" }),
      context,
      () => undefined
    );
    if (!result) throw new Error("No result");
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when price is negative", async () => {
    const result = await handler(
      makeEvent({ ...validBody, price: -1 }),
      context,
      () => undefined
    );
    if (!result) throw new Error("No result");
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when count is not an integer", async () => {
    const result = await handler(
      makeEvent({ ...validBody, count: 1.5 }),
      context,
      () => undefined
    );
    if (!result) throw new Error("No result");
    expect(result.statusCode).toBe(400);
  });

  it("returns 500 on DynamoDB error", async () => {
    ddbMock.on(TransactWriteCommand).rejects(new Error("boom"));

    const result = await handler(makeEvent(validBody), context, () => undefined);
    if (!result) throw new Error("No result");
    expect(result.statusCode).toBe(500);
  });
});
