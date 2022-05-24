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
        '@typescript-eslint/no-unused-vars': 'error',
        // TODO: Remove warn rules when not needed anymore
        "no-self-assign": "off",
        "@typescript-eslint/no-empty-interface": "off",
        "react/prop-types": [2, { ignore: ['children'] }]
    },
    settings: {
        react: {
            version: "detect",
        },
    },
};
