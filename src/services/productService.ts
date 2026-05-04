import {
  ScanCommand,
  GetCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import {
  ddb,
  PRODUCTS_TABLE_NAME,
  STOCKS_TABLE_NAME,
} from "../db/client";
import { AvailableProduct } from "../types/product";
import { ProductRecord, Stock } from "../types/stock";

export interface CreateProductInput {
  title: string;
  description?: string;
  price: number;
  count: number;
}

const joinProductWithStock = (
  product: ProductRecord,
  stock: Stock | undefined
): AvailableProduct => ({
  id: product.id,
  title: product.title,
  description: product.description ?? "",
  price: product.price,
  count: stock?.count ?? 0,
});

export const getAllProducts = async (): Promise<AvailableProduct[]> => {
  const [productsResult, stocksResult] = await Promise.all([
    ddb.send(new ScanCommand({ TableName: PRODUCTS_TABLE_NAME })),
    ddb.send(new ScanCommand({ TableName: STOCKS_TABLE_NAME })),
  ]);

  const products = (productsResult.Items ?? []) as ProductRecord[];
  const stocks = (stocksResult.Items ?? []) as Stock[];

  const stockByProductId = new Map<string, Stock>(
    stocks.map((s) => [s.product_id, s])
  );

  return products.map((p) =>
    joinProductWithStock(p, stockByProductId.get(p.id))
  );
};

export const getProductById = async (
  productId: string
): Promise<AvailableProduct | null> => {
  const [productResult, stockResult] = await Promise.all([
    ddb.send(
      new GetCommand({
        TableName: PRODUCTS_TABLE_NAME,
        Key: { id: productId },
      })
    ),
    ddb.send(
      new GetCommand({
        TableName: STOCKS_TABLE_NAME,
        Key: { product_id: productId },
      })
    ),
  ]);

  const product = productResult.Item as ProductRecord | undefined;
  if (!product) return null;

  return joinProductWithStock(product, stockResult.Item as Stock | undefined);
};

export const createProduct = async (
  input: CreateProductInput
): Promise<AvailableProduct> => {
  const id = uuidv4();
  const product: ProductRecord = {
    id,
    title: input.title,
    description: input.description ?? "",
    price: input.price,
  };
  const stock: Stock = { product_id: id, count: input.count };

  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: PRODUCTS_TABLE_NAME,
            Item: product,
            ConditionExpression: "attribute_not_exists(id)",
          },
        },
        {
          Put: {
            TableName: STOCKS_TABLE_NAME,
            Item: stock,
            ConditionExpression: "attribute_not_exists(product_id)",
          },
        },
      ],
    })
  );

  return joinProductWithStock(product, stock);
};
