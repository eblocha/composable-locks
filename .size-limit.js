import * as pkg from "./dist/index.js";

const names = Object.keys(pkg);
const path = "dist/index.js";

export default [
  {
    path,
    name: "Entire Bundle",
  },
  ...names.map((name) => ({
    path,
    name,
    import: `{ ${name} }`,
  })),
];
