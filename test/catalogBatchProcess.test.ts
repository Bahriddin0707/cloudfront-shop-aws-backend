import type { SQSEvent, Context } from "aws-lambda";

jest.mock("../src/services/productService", () => ({
  createProduct: jest.fn(),
}));

const sendMock = jest.fn();
jest.mock("@aws-sdk/client-sns", () => {
  class PublishCommand {
    public readonly input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  return {
    SNSClient: jest.fn().mockImplementation(() => ({ send: sendMock })),
    PublishCommand,
  };
});

import { createProduct } from "../src/services/productService";
import { PublishCommand } from "@aws-sdk/client-sns";

process.env.CREATE_PRODUCT_TOPIC_ARN =
  "arn:aws:sns:us-east-1:000000000000:test-topic";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { handler } = require("../src/handlers/catalogBatchProcess");

const mockedCreate = createProduct as jest.MockedFunction<typeof createProduct>;

const context = {} as Context;

const makeRecord = (id: string, body: unknown) => ({
  messageId: id,
  receiptHandle: "rh",
  body: typeof body === "string" ? body : JSON.stringify(body),
  attributes: {},
  messageAttributes: {},
  md5OfBody: "x",
  eventSource: "aws:sqs",
  eventSourceARN: "arn:aws:sqs:us-east-1:000000000000:catalogItemsQueue",
  awsRegion: "us-east-1",
});

const makeEvent = (records: ReturnType<typeof makeRecord>[]): SQSEvent =>
  ({ Records: records } as SQSEvent);

beforeEach(() => {
  mockedCreate.mockReset();
  sendMock.mockReset();
  sendMock.mockResolvedValue({});
});

describe("catalogBatchProcess handler", () => {
  const validRow = {
    title: "Wireless Mouse",
    description: "Ergonomic",
    price: 29.99,
    count: 15,
  };

  it("creates a product and publishes SNS for a single valid record", async () => {
    mockedCreate.mockResolvedValueOnce({
      id: "uuid-1",
      title: validRow.title,
      description: validRow.description,
      price: validRow.price,
      count: validRow.count,
    });

    await handler(makeEvent([makeRecord("m1", validRow)]), context, () => undefined);

    expect(mockedCreate).toHaveBeenCalledTimes(1);
    expect(mockedCreate).toHaveBeenCalledWith({
      title: "Wireless Mouse",
      description: "Ergonomic",
      price: 29.99,
      count: 15,
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const publishedArg = sendMock.mock.calls[0][0] as PublishCommand;
    expect(publishedArg).toBeInstanceOf(PublishCommand);
    const input = (publishedArg as unknown as { input: any }).input;
    expect(input.TopicArn).toBe(process.env.CREATE_PRODUCT_TOPIC_ARN);
    expect(JSON.parse(input.Message).id).toBe("uuid-1");
    expect(input.MessageAttributes.price.DataType).toBe("Number");
    expect(input.MessageAttributes.price.StringValue).toBe("29.99");
  });

  it("processes a batch of multiple valid records", async () => {
    mockedCreate.mockImplementation(async (input) => ({
      id: `id-${input.title}`,
      title: input.title,
      description: input.description ?? "",
      price: input.price,
      count: input.count,
    }));

    const rows = [
      { title: "A", price: 1, count: 1 },
      { title: "B", price: 2, count: 2 },
      { title: "C", price: 3, count: 3 },
    ];

    await handler(
      makeEvent(rows.map((r, i) => makeRecord(`m${i}`, r))),
      context,
      () => undefined
    );

    expect(mockedCreate).toHaveBeenCalledTimes(3);
    expect(sendMock).toHaveBeenCalledTimes(3);
  });

  it("string numbers from CSV are coerced to numbers", async () => {
    mockedCreate.mockResolvedValueOnce({
      id: "id-1",
      title: "From CSV",
      description: "",
      price: 49,
      count: 20,
    });

    await handler(
      makeEvent([
        makeRecord("m1", {
          title: "From CSV",
          description: "",
          price: "49",
          count: "20",
        }),
      ]),
      context,
      () => undefined
    );

    expect(mockedCreate).toHaveBeenCalledWith({
      title: "From CSV",
      description: "",
      price: 49,
      count: 20,
    });
  });

  it("throws when any record is invalid (so SQS retries that batch)", async () => {
    await expect(
      handler(
        makeEvent([
          makeRecord("m1", { title: "", price: 1, count: 1 }),
        ]),
        context,
        () => undefined
      )
    ).rejects.toThrow(/failed/i);

    expect(mockedCreate).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("throws when the SQS message body is not valid JSON", async () => {
    await expect(
      handler(makeEvent([makeRecord("m1", "not-json")]), context, () => undefined)
    ).rejects.toThrow(/failed/i);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("throws when DDB createProduct fails", async () => {
    mockedCreate.mockRejectedValueOnce(new Error("DDB boom"));

    await expect(
      handler(makeEvent([makeRecord("m1", validRow)]), context, () => undefined)
    ).rejects.toThrow(/failed/i);

    expect(sendMock).not.toHaveBeenCalled();
  });

  it("does not throw when SNS publish fails (best-effort notification)", async () => {
    mockedCreate.mockResolvedValueOnce({
      id: "uuid-1",
      title: validRow.title,
      description: validRow.description,
      price: validRow.price,
      count: validRow.count,
    });
    sendMock.mockRejectedValueOnce(new Error("SNS boom"));

    await expect(
      handler(makeEvent([makeRecord("m1", validRow)]), context, () => undefined)
    ).resolves.toBeUndefined();

    expect(mockedCreate).toHaveBeenCalledTimes(1);
  });
});
