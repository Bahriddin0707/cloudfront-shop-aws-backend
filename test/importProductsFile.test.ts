import type { APIGatewayProxyEvent, Context } from "aws-lambda";

jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: jest.fn(),
}));

jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({})),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";

const mockedGetSignedUrl = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>;
const mockedPutObjectCommand = PutObjectCommand as unknown as jest.Mock;

process.env.IMPORT_BUCKET_NAME = "test-bucket";
process.env.UPLOAD_PREFIX = "uploaded/";
process.env.SIGNED_URL_TTL = "60";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { handler } = require("../src/handlers/importProductsFile");

const context = {} as Context;

const makeEvent = (
  queryStringParameters: Record<string, string> | null
): APIGatewayProxyEvent =>
  ({ queryStringParameters } as unknown as APIGatewayProxyEvent);

beforeEach(() => {
  mockedGetSignedUrl.mockReset();
  mockedPutObjectCommand.mockClear();
});

describe("importProductsFile handler", () => {
  it("returns 200 with presigned URL when name is a valid .csv", async () => {
    mockedGetSignedUrl.mockResolvedValueOnce(
      "https://signed.example/uploaded/test.csv?sig=abc"
    );

    const result = await handler(
      makeEvent({ name: "test.csv" }),
      context,
      () => undefined
    );
    if (!result) throw new Error("No result");

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toBe(
      "https://signed.example/uploaded/test.csv?sig=abc"
    );
    expect(mockedPutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: "test-bucket",
        Key: "uploaded/test.csv",
        ContentType: "text/csv",
      })
    );
    expect(mockedGetSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ expiresIn: 60 })
    );
  });

  it("returns 400 when name query parameter is missing", async () => {
    const result = await handler(makeEvent(null), context, () => undefined);
    if (!result) throw new Error("No result");
    expect(result.statusCode).toBe(400);
    expect(mockedGetSignedUrl).not.toHaveBeenCalled();
  });

  it("returns 400 when name is empty", async () => {
    const result = await handler(
      makeEvent({ name: "   " }),
      context,
      () => undefined
    );
    if (!result) throw new Error("No result");
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when name is not a .csv file", async () => {
    const result = await handler(
      makeEvent({ name: "evil.exe" }),
      context,
      () => undefined
    );
    if (!result) throw new Error("No result");
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when name contains path traversal characters", async () => {
    const result = await handler(
      makeEvent({ name: "../etc/passwd.csv" }),
      context,
      () => undefined
    );
    if (!result) throw new Error("No result");
    expect(result.statusCode).toBe(400);
  });

  it("returns 500 when getSignedUrl throws", async () => {
    mockedGetSignedUrl.mockRejectedValueOnce(new Error("aws boom"));

    const result = await handler(
      makeEvent({ name: "ok.csv" }),
      context,
      () => undefined
    );
    if (!result) throw new Error("No result");
    expect(result.statusCode).toBe(500);
  });

  it("includes CORS header in successful response", async () => {
    mockedGetSignedUrl.mockResolvedValueOnce("https://signed.example/x");

    const result = await handler(
      makeEvent({ name: "ok.csv" }),
      context,
      () => undefined
    );
    if (!result) throw new Error("No result");
    expect(result.headers?.["Access-Control-Allow-Origin"]).toBe("*");
  });
});
