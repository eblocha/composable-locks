import * as pkg from "./src/index.ts";

const names = Object.keys(pkg);
const path = "src/index.ts";

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
