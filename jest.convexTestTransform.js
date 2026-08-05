/**
 * Jest transformer for `convex-test`.
 *
 * `convex-test/dist/index.js` contains
 *   const modules = specifiedModules ?? import.meta.glob("../../../convex/**\/*.*s");
 * which is a Vite-only construct. Jest runs CommonJS, so the file fails to parse
 * before any of our code executes — even though we always pass `specifiedModules`
 * explicitly and the glob would never be evaluated.
 *
 * Replacing the glob call with `undefined` keeps the package usable under Jest
 * without patching node_modules. It only ever applies to convex-test (see the
 * `transform` entry in jest.config.js).
 */
const path = require('path');
const babelJest = require('babel-jest').default;

const transformer = babelJest.createTransformer({
  configFile: path.join(__dirname, 'jest.babel.config.js'),
});

module.exports = {
  ...transformer,
  process(sourceText, sourcePath, options) {
    const patched = sourceText.replace(/import\.meta\.glob\([^)]*\)/g, 'undefined');
    return transformer.process(patched, sourcePath, options);
  },
};
