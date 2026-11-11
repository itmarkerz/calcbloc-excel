/* eslint-disable no-undef */
/* global require, module, process, __dirname */
const path = require("path");
const webpack = require("webpack");
const devCerts = require("office-addin-dev-certs");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const CustomFunctionsMetadataPlugin = require("custom-functions-metadata-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");

const port = Number(process.env.npm_package_config_dev_server_port || 3104);
const urlDev = `https://localhost:${port}/`;
// Production host for the add-in's web files. Not decided yet (owner decision, see PUBLISHING_CHECKLIST.md);
// set CALCBLOC_ADDIN_URL when building for release, e.g. CALCBLOC_ADDIN_URL=https://example.com/excel/ npm run build
const urlProd = (process.env.CALCBLOC_ADDIN_URL || "https://example.com/calcbloc-excel/").replace(/\/?$/, "/");

async function httpsOptions() {
  const o = await devCerts.getHttpsServerOptions();
  return { ca: o.ca, key: o.key, cert: o.cert };
}

module.exports = async (env, options) => {
  const dev = options.mode === "development";
  if (!dev && !process.env.CALCBLOC_ADDIN_URL) {
    console.warn(`CALCBLOC_ADDIN_URL is not set: dist/manifest.xml points at the placeholder ${urlProd}`);
  }
  const entry = {
    // Shared runtime: the task pane page loads the custom functions too, so both use one module instance.
    taskpane: ["./src/functions/functions.ts", "./src/taskpane/taskpane.ts"],
    // Referenced by the manifest's <Script> element (required there; Excel uses the shared page).
    functions: "./src/functions/functions.ts",
  };
  if (dev) entry.harness = "./src/harness/harness.ts";

  const plugins = [
    new webpack.DefinePlugin({ __DEV__: JSON.stringify(dev) }),
    new CustomFunctionsMetadataPlugin({ output: "functions.json", input: "./src/functions/functions.ts" }),
    new HtmlWebpackPlugin({ filename: "taskpane.html", template: "./src/taskpane/taskpane.html", chunks: ["taskpane"] }),
    new CopyWebpackPlugin({
      patterns: [
        { from: "assets/*.png", to: "assets/[name][ext]" },
        { from: "src/taskpane/taskpane.css", to: "taskpane.css" },
        {
          from: "manifest.xml",
          to: "manifest.xml",
          transform(content) {
            return dev ? content : content.toString().split(urlDev).join(urlProd);
          },
        },
        ...(dev ? [{ from: "test/fixtures", to: "fixtures" }] : []),
      ],
    }),
  ];
  if (dev) plugins.push(new HtmlWebpackPlugin({ filename: "harness.html", template: "./src/harness/harness.html", chunks: ["harness"] }));

  return {
    devtool: dev ? "source-map" : false,
    entry,
    output: { path: path.resolve(__dirname, "dist"), filename: "[name].js", clean: true },
    resolve: { extensions: [".ts", ".js"] },
    module: {
      rules: [{ test: /\.ts$/, exclude: /node_modules/, use: { loader: "ts-loader", options: { transpileOnly: true } } }],
    },
    plugins,
    performance: { hints: false },
    devServer: {
      static: false,
      headers: { "Access-Control-Allow-Origin": "*" },
      // CALCBLOC_SELF_SIGNED=1: throwaway self-signed certificate (browser harness only; Excel needs `npm run certs`).
      server: process.env.CALCBLOC_SELF_SIGNED
        ? "https"
        : { type: "https", options: env.WEBPACK_BUILD || options.https !== undefined ? options.https : await httpsOptions() },
      port,
      host: "localhost",
      allowedHosts: ["localhost"],
      client: { overlay: { errors: true, warnings: false } },
    },
  };
};
