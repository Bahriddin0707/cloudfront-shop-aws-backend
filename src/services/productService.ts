import { products } from "../data/products";
import { AvailableProduct } from "../types/product";

export const getAllProducts = async (): Promise<AvailableProduct[]> => {
  return products;
};

export const getProductById = async (
  productId: string
): Promise<AvailableProduct | null> => {
  const product = products.find((p) => p.id === productId);
  return product ?? null;
};
