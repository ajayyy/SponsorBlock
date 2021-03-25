const webpack = require("webpack");
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const BuildManifest = require('./webpack.manifest');
const srcDir = '../src/';

module.exports = env => ({
    entry: {
        popup: path.join(__dirname, srcDir + 'popup.ts'),
        background: path.join(__dirname, srcDir + 'background.ts'),
        content: path.join(__dirname, srcDir + 'content.ts'),
        options:  path.join(__dirname, srcDir + 'options.ts'),
        permissions:  path.join(__dirname, srcDir + 'permissions.ts')
    },
    output: {
        path: path.join(__dirname, '../dist/js'),
        filename: '[name].js'
    },
    optimization: {
        splitChunks: {
            name: 'vendor',
            chunks: "initial"
        }
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/
            }
        ]
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js']
    },
    plugins: [
        // exclude locale files in moment
        new CopyPlugin({
          patterns: [
            {
              from: '.',
              to: '../',
              globOptions: {
                ignore: ['manifest.json'],
              },
              context: './public',
            }
          ]
        }),
        new BuildManifest({
            browser: env.browser,
            pretty: env.mode === "production",
            stream: env.stream
        })
    ]
});
