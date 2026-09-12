import path from "path";

// Shared by auth.setup.ts (writes these) and golden.spec.ts (reads these via
// `storageState`). Kept out of the *.setup.ts file itself because Playwright
// disallows importing one test file from another.
export const ceoAuthFile = path.join(__dirname, ".auth", "ceo.json");
export const salesAuthFile = path.join(__dirname, ".auth", "sales.json");
