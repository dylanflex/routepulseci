// craco.config.js
const path = require("path");
require("dotenv").config();

// Environment variable overrides
const config = {
  enableHealthCheck: process.env.ENABLE_HEALTH_CHECK === "true",
};

function makeDevServerV5Compatible(devServerConfig) {
  const {
    https,
    onAfterSetupMiddleware,
    onBeforeSetupMiddleware,
    onListening,
    setupMiddlewares,
    ...compatibleConfig
  } = devServerConfig;

  compatibleConfig.server =
    typeof https === "object"
      ? { type: "https", options: https }
      : https
        ? "https"
        : "http";
  compatibleConfig.headers = {
    ...compatibleConfig.headers,
    "Cross-Origin-Resource-Policy": "same-origin",
  };

  if (onBeforeSetupMiddleware || setupMiddlewares) {
    compatibleConfig.setupMiddlewares = (middlewares, devServer) => {
      if (onBeforeSetupMiddleware) {
        onBeforeSetupMiddleware(devServer);
      }

      return setupMiddlewares
        ? setupMiddlewares(middlewares, devServer)
        : middlewares;
    };
  }

  compatibleConfig.onListening = (devServer) => {
    devServer.close ??= (callback) => devServer.stopCallback(callback);

    if (onListening) {
      onListening(devServer);
    }
    if (onAfterSetupMiddleware) {
      onAfterSetupMiddleware(devServer);
    }
  };

  return compatibleConfig;
}

// Conditionally load health check modules only if enabled
let WebpackHealthPlugin;
let setupHealthEndpoints;
let healthPluginInstance;

if (config.enableHealthCheck) {
  WebpackHealthPlugin = require("./plugins/health-check/webpack-health-plugin");
  setupHealthEndpoints = require("./plugins/health-check/health-endpoints");
  healthPluginInstance = new WebpackHealthPlugin();
}

let webpackConfig = {
  eslint: {
    configure: {
      extends: ["plugin:react-hooks/recommended"],
      rules: {
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "warn",
      },
    },
  },
  jest: {
    configure: (jestConfig) => {
      // CRA's bundled Jest predates package.json "exports" resolution, so
      // ESM-only packages like react-router-dom v7 need an explicit mapping.
      jestConfig.moduleNameMapper = {
        ...jestConfig.moduleNameMapper,
        "^@/(.*)$": "<rootDir>/src/$1",
        "^react-router-dom$": "<rootDir>/node_modules/react-router-dom/dist/index.js",
        "^react-router/dom$": "<rootDir>/node_modules/react-router/dist/development/dom-export.js",
        "^react-router$": "<rootDir>/node_modules/react-router/dist/development/index.js",
      };
      return jestConfig;
    },
  },
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    configure: (webpackConfig) => {

      // Add ignored patterns to reduce watched directories
        webpackConfig.watchOptions = {
          ...webpackConfig.watchOptions,
          ignored: [
            '**/node_modules/**',
            '**/.git/**',
            '**/build/**',
            '**/dist/**',
            '**/coverage/**',
            '**/public/**',
        ],
      };

      // Add health check plugin to webpack if enabled
      if (config.enableHealthCheck && healthPluginInstance) {
        webpackConfig.plugins.push(healthPluginInstance);
      }

      // CRA's babel-loader has a second rule (besides the one for src/) that
      // also transpiles .js files inside node_modules, to down-compile any
      // dependency shipped as raw ES2015+/ESM. Running mapbox-gl's already-
      // browser-ready UMD dist through it introduces webpack-require-wrapped
      // babel helpers (e.g. "_slicedToArray") into mapbox-gl's source. That
      // breaks mapbox-gl's own worker bootstrap, which extracts a substring
      // of its bundle into a Blob to run as a Web Worker: the extracted
      // substring ends up calling a helper that only exists via
      // __webpack_require__(id) in the main thread's module registry, which
      // doesn't exist in the worker's isolated global scope -- causing
      // "<helper> is not defined" ReferenceErrors inside vector-tile parsing
      // (a different missing helper each build, depending on module ids).
      // Fix: make mapbox-gl bypass babel-loader entirely so its file reaches
      // the bundle byte-for-byte, exactly as it does via a plain <script> tag.
      const oneOfRules = webpackConfig.module.rules.find((rule) => Array.isArray(rule.oneOf))?.oneOf;
      if (oneOfRules) {
        oneOfRules.unshift({
          test: /\.m?js$/,
          include: /[\\/]node_modules[\\/]mapbox-gl[\\/]/,
        });
      }

      // Force mapbox-gl into its own named chunk. Terser's exclude/test option
      // matches against the *output asset name*, not the source module path —
      // without this, mapbox-gl gets fused into an anonymously-numbered chunk
      // (e.g. "1.<hash>.chunk.js") that no regex on "node_modules/mapbox-gl"
      // can ever match, so the exclude below silently does nothing.
      webpackConfig.optimization.splitChunks = {
        ...webpackConfig.optimization.splitChunks,
        cacheGroups: {
          ...webpackConfig.optimization.splitChunks?.cacheGroups,
          mapboxGl: {
            test: /[\\/]node_modules[\\/]mapbox-gl[\\/]/,
            name: "mapbox-gl",
            chunks: "all",
            enforce: true,
          },
        },
      };

      // Parallel Terser minification spawns worker processes that have been
      // observed to crash with an access violation on memory-constrained
      // Windows hosts once larger deps are bundled in. mapbox-gl v3 is large
      // enough that even single-threaded minification exhausts memory ("Zone"
      // OOM) on an 8 GB host, and re-minifying its already-compact dist has
      // also been observed to corrupt its worker bundle (undefined variable
      // references inside mapbox-gl's dynamically-loaded worker) — so we
      // disable parallelism AND skip re-minifying the named mapbox-gl chunk.
      if (webpackConfig.optimization?.minimizer) {
        webpackConfig.optimization.minimizer.forEach((minimizer) => {
          if (minimizer.options && "parallel" in minimizer.options) {
            minimizer.options.parallel = false;
            minimizer.options.exclude = /mapbox-gl/;
          }
        });
      }

      return webpackConfig;
    },
  },
};

webpackConfig.devServer = (devServerConfig) => {
  // Add health check endpoints if enabled
  if (config.enableHealthCheck && setupHealthEndpoints && healthPluginInstance) {
    const originalSetupMiddlewares = devServerConfig.setupMiddlewares;

    devServerConfig.setupMiddlewares = (middlewares, devServer) => {
      // Call original setup if exists
      if (originalSetupMiddlewares) {
        middlewares = originalSetupMiddlewares(middlewares, devServer);
      }

      // Setup health endpoints
      setupHealthEndpoints(devServer, healthPluginInstance);

      return middlewares;
    };
  }

  return devServerConfig;
};

const configureDevServer = webpackConfig.devServer;
webpackConfig.devServer = (devServerConfig) =>
  makeDevServerV5Compatible(configureDevServer(devServerConfig));

module.exports = webpackConfig;
