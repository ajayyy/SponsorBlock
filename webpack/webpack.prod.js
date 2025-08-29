/* eslint-disable @typescript-eslint/no-var-requires */
const { SourceMapDevToolPlugin } = require('webpack');
const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');

function createGHPSourceMapURL(env) {
    const manifest = require("../manifest/manifest.json");
    const version = manifest.version;
    const [owner, repo_name] = (process.env.GITHUB_REPOSITORY ?? "ajayyy/SponsorBlock").split("/");
    return `https://${owner.toLowerCase()}.github.io/${repo_name}/${env.browser}${env.stream === "beta" ? "-beta" : ""}/${version}/`;
}

module.exports = env => {
    let mode = "production";
    env.mode = mode;

    return merge(common(env), {
        mode,
        ...(env.ghpSourceMaps
            ? {
                devtool: false,
                plugins: [new SourceMapDevToolPlugin({
                    publicPath: createGHPSourceMapURL(env),
                    filename: '[file].map[query]',
                })],
            }
            : {
                devtool: "source-map",
            }
        ),
    });
};
