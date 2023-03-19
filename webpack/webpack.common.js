/* eslint-disable @typescript-eslint/no-var-requires */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const webpack = require("webpack");
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const BuildManifest = require('./webpack.manifest');
const srcDir = '../src/';
const fs = require("fs");
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const configDiffPlugin = require('./configDiffPlugin');

const edgeLanguages = [
    "de",
    "en",
    "es",
    "fr",
    "pl",
    "pt_BR",
    "ro",
    "ru",
    "sk",
    "sv",
    "tr",
    "uk",
    "zh_CN"
]



module.exports = env => {
    const documentScriptBuild = webpack({
        entry: {
            document: {
                import: path.join(__dirname, srcDir + 'document.ts'),
            },
        },
        output: {
            path: path.join(__dirname, '../dist/js'),
        },
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    loader: 'ts-loader',
                    exclude: /node_modules/,
                    resourceQuery: { not: [/raw/] },
                    options: {
                        // disable type checker for user in fork plugin
                        transpileOnly: true,
                        configFile: env.mode === "production" ? "tsconfig-production.json" : "tsconfig.json"
                    }
                },
            ]
        },
        resolve: {
            extensions: ['.ts', '.tsx', '.js']
        },
        plugins: [
            // Don't fork TS checker for document script to speed up
            // new ForkTsCheckerWebpackPlugin()
        ]
    });

    class DocumentScriptCompiler {
        currentWatching = null;

        /**
         * 
         * @param {webpack.Compiler} compiler 
         */
        apply(compiler) {
            compiler.hooks.beforeCompile.tapAsync({ name: 'DocumentScriptCompiler' }, (compiler, callback) => {
                if (env.WEBPACK_WATCH) {
                    let first = true;
                    if (!this.currentWatching) {
                        this.currentWatching = documentScriptBuild.watch({}, () => {
                            if (first) {
                                first = false;
                                callback();
                            }
                        });
                    } else {
                        callback();
                    }
                } else {
                    documentScriptBuild.close(() => {
                        documentScriptBuild.run(() => {
                            callback();
                        });
                    });
                }
            });
        }
    }

    return {
        entry: {
            popup: path.join(__dirname, srcDir + 'popup.ts'),
            background: path.join(__dirname, srcDir + 'background.ts'),
            content: path.join(__dirname, srcDir + 'content.ts'),
            options: path.join(__dirname, srcDir + 'options.ts'),
            help: path.join(__dirname, srcDir + 'help.ts'),
            permissions: path.join(__dirname, srcDir + 'permissions.ts'),
        },
        output: {
            path: path.join(__dirname, '../dist/js'),
        },
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    loader: 'ts-loader',
                    exclude: /node_modules/,
                    resourceQuery: { not: [/raw/] },
                    options: {
                        // disable type checker for user in fork plugin
                        transpileOnly: true,
                        configFile: env.mode === "production" ? "tsconfig-production.json" : "tsconfig.json"
                    }
                },
                {
                    test: /js\/document\.js$/,
                    type: 'asset/source'
                }
            ]
        },
        resolve: {
            extensions: ['.ts', '.tsx', '.js']
        },
        plugins: [
            // Prehook to start building document script before normal build
            new DocumentScriptCompiler(),
            // fork TS checker
            new ForkTsCheckerWebpackPlugin(),
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
                        filter: async (path) => {
                            if (path.match(/\/_locales\/.+/)) {
                                if (env.browser.toLowerCase() === "edge" 
                                        && !edgeLanguages.includes(path.match(/(?<=\/_locales\/)[^/]+(?=\/[^/]+$)/)[0])) {
                                    return false;
                                }

                                const data = await fs.promises.readFile(path);
                                const parsed = JSON.parse(data.toString());

                                return parsed.fullName && parsed.Description;
                            } else {
                                return true;
                            }
                        },
                        transform(content, path) {
                            if (path.match(/\/_locales\/.+/)) {
                                const parsed = JSON.parse(content.toString());
                                if (env.browser.toLowerCase() === "safari") {
                                    parsed.fullName.message = parsed.fullName.message.match(/^.+(?= -)/)?.[0] || parsed.fullName.message;
                                    if (parsed.fullName.message.length > 50) {
                                        parsed.fullName.message = parsed.fullName.message.slice(0, 47) + "...";
                                    }

                                    parsed.Description.message = parsed.Description.message.match(/^.+(?=\. )/)?.[0] || parsed.Description.message;
                                    if (parsed.Description.message.length > 80) {
                                        parsed.Description.message = parsed.Description.message.slice(0, 77) + "...";
                                    }
                                }
                
                                return Buffer.from(JSON.stringify(parsed));
                            }

                            return content;
                        }
                    }
                ]
            }),
            new BuildManifest({
                browser: env.browser,
                pretty: env.mode === "production",
                stream: env.stream
            }),
            new configDiffPlugin()
        ]
    };
};