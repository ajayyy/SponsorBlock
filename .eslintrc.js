module.exports = {
    parser: "@typescript-eslint/parser",
    plugins: [
        "@typescript-eslint",
    ],
    env: {
        browser: true,
        es6: true,
        webextensions: true
    },
    ignorePatterns: ["dist"],
    extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/eslint-recommended",
        "plugin:@typescript-eslint/recommended",
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
        "no-unused-vars": ["off"],
        "no-undef": ["off"],
        "no-void": ["off"],
        "standard/no-callback-literal": ["off"],
        "no-return-assign": ["off"],
        "no-case-declarations": ["off"],
        "prefer-const": ["off"],
        "spaced-comment": ["off"],
        "@typescript-eslint/explicit-function-return-type": ["off"],
        "@typescript-eslint/no-use-before-define": ["off"],
        "@typescript-eslint/no-explicit-any": ["off"],
    }
};
