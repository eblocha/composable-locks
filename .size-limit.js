const pkg = require("./dist/index.js");

const names = Object.keys(pkg);
const path = "dist/index.mjs";

module.exports = [
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
