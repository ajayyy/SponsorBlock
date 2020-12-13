module.exports = {
    env: {
        browser: true,
        es2021: true,
        node: true,
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
        "@typescript-eslint/no-this-alias": "warn",
        "no-self-assign": "warn",
        "@typescript-eslint/no-empty-interface": "warn",
        "@typescript-eslint/ban-types": "warn",
    },
    settings: {
        react: {
            version: "detect",
        },
    },
};
