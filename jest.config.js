/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/test"],
  testMatch: ["**/*.test.ts"],
  moduleFileExtensions: ["ts", "js"],
  collectCoverageFrom: ["src/**/*.ts"],
  transform: {
    "^.+\\.(ts|js)$": ["ts-jest", { isolatedModules: true }],
  },
  transformIgnorePatterns: [
    "/node_modules/(?!(@nodable|@smithy|@aws-sdk)/)",
  ],
};
