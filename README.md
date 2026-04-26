# Product Service (AWS Course - Module 3: Serverless)

CDK-based serverless backend exposing two REST endpoints via API Gateway + AWS Lambda.

## Endpoints

| Method | Path                     | Lambda            | Description                       |
| ------ | ------------------------ | ----------------- | --------------------------------- |
| GET    | `/products`              | `getProductsList` | Returns the full list of products |
| GET    | `/products/{productId}`  | `getProductsById` | Returns a single product by id    |

Mock data lives in [`src/data/products.ts`](src/data/products.ts).

## Stack

- **Language**: TypeScript (ES module syntax, async/await)
- **IaC**: AWS CDK v2
- **Compute**: AWS Lambda (Node.js 20.x), bundled with esbuild via `NodejsFunction`
- **API**: AWS API Gateway REST API (Lambda Proxy integration, CORS enabled)
- **Tests**: Jest + ts-jest

## Project layout

```
bin/                     CDK app entry
lib/                     CDK stack definition
src/handlers/            Lambda handlers (one per file)
src/services/            Business logic (mock data access)
src/data/                Mock products
src/utils/               Response helper (CORS)
src/types/               Shared TypeScript types
test/                    Jest unit tests
swagger/openapi.yaml     OpenAPI 3.0 documentation
```

## Scripts

```powershell
npm install
npm test                 # run unit tests
npm run build            # tsc typecheck
npx cdk bootstrap        # one-time per account/region
npx cdk deploy           # deploy stack
npx cdk destroy          # tear down
```

## Deployment

By default the stack deploys to `eu-west-1` (override with `CDK_DEFAULT_REGION`).
After `cdk deploy` the API URL is printed as the `ApiUrl` / `ProductsEndpoint` output.
