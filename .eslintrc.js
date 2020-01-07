module.exports = {
    env: {
        browser: true,
        es6: true,
        webextensions: true
    },
    extends: [
        "standard"
    ],
    globals: {
        Atomics: "readonly",
        SharedArrayBuffer: "readonly"
    },
    parserOptions: {
        ecmaVersion: 2018
    },
    rules: {
        indent: ["error", 4],
        quotes: ["error", "double"],
        semi: ["error", "always"],
        "object-curly-spacing": ["error", "never"],
        "space-before-function-paren": ["error", "never"],
        "no-unused-vars": ["off"]
    }
};
