module.exports = {
    env: {
        browser: true,
        es2021: true,
        node: true,
        jest: true,
        jasmine: true,
    },
    extends: [
        "eslint:recommended",
        "plugin:react/recommended",
        "plugin:@typescript-eslint/recommended",
    ],
    parser: "@typescript-eslint/parser",
    parserOptions: {
        ecmaFeatures: {
            jsx: true,
        },
        ecmaVersion: 12,
        sourceType: "module",
    },
    plugins: ["react", "@typescript-eslint"],
    rules: {
        // TODO: Remove warn rules when not needed anymore
        "no-self-assign": "off",
        "@typescript-eslint/no-empty-interface": "off",
    },
    settings: {
        react: {
            version: "detect",
        },
    },
};
