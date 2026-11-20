const HtmlMinimizerPlugin = require("html-minimizer-webpack-plugin");
const PACKAGE = require('./package.json');
const ZipPlugin = require('zip-webpack-plugin');
const CopyPlugin = require("copy-webpack-plugin");
const path = require('path');
const glob = require("glob");
module.exports = env=>({
  mode: 'production',
  entry: {
    service: ['./Extension/background.js'],
    content: [
      './Extension/contentScript.js',
      "./Extension/content.scss",
      "./Extension/icon_16.png",
      "./Extension/icon_32.png",
      "./Extension/icon_48.png",
      "./Extension/icon_96.png",
      "./Extension/icon_128.png",
      "./Extension/hide.svg", "./Extension/logo.svg", "./Extension/minimize.svg"
    ],
    log: [
      './Extension/log.js',
      './Extension/log.html'
    ],
    ui: [
      './Extension/popup.js',
      './Extension/popup.html'
    ]
  },
  output: {
    publicPath: "",
    filename: '[name].js',
    path: path.resolve(__dirname, 'build')
  },
  module: {
    parser: {
	javascript: {
	    exportsPresence: "error",
	    importExportsPresence: "error"
	}
    },
    rules: [
      {
        test: /\.(png|json|svg|html)/,
        type: 'asset/resource',
        generator: {
          filename: '[name][ext]'
        }
      },
      {
        test: /\.(sc|sa)ss$/i,
        type: 'asset/resource',
        use: [
          "sass-loader"
        ],
        generator: {
          filename: '[name].css'
        }
      },      
    ]
  },
  optimization: {
    minimize: true,
    minimizer: [
      '...',
      new HtmlMinimizerPlugin(),
     ],
  },
  plugins: [
    new CopyPlugin({patterns: [{
        from: "Extension/manifest." + env.target + ".json",
        to: "manifest.json",
        force: true,
        transform(content, path) {
            // Parse the manifest JSON and inject version
            const manifest = JSON.parse(content.toString());
            manifest.version = PACKAGE.version;
            return JSON.stringify(manifest, null, 2);
        }
    }, {
        // 원본(Consent-O-Matic)의 저작권 표시와 허가 조건을 묶음에 포함
        from: "LICENSE",
        to: "LICENSE.txt"
    }, {
        // DuckDuckGo autoconsent의 규칙 파일과 허가 조건(MPL-2.0)
        from: "node_modules/@duckduckgo/autoconsent/rules/compact-rules.json",
        to: "autoconsent/compact-rules.json"
    }, {
        from: "node_modules/@duckduckgo/autoconsent/rules/rules.json",
        to: "autoconsent/rules.json"
    }, {
        from: "node_modules/@duckduckgo/autoconsent/LICENSE",
        to: "autoconsent/LICENSE.txt"
    }, {
        // Consent-O-Matic 규칙(받은 판: 8ca8500, 2025-11-07)을 합친 파일
        from: "rules/consent-o-matic-rules.json",
        to: "consentomatic/rules.json"
    }]}),
    new ZipPlugin({
      path: 'dist/',
      filename: PACKAGE.name+"-v"+PACKAGE.version+"-unpacked-release-"+env.target+".zip",
      exclude: [/^dist/]
    })
  ]
});