/* eslint-disable @typescript-eslint/no-var-requires */
const { SourceMapDevToolPlugin } = require('webpack');
const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');

async function createGHPSourceMapURL(env) {
    const manifest = require("../manifest/manifest.json");
    const version = manifest.version;
    const [owner, repo_name] = (process.env.GITHUB_REPOSITORY ?? "ajayyy/SponsorBlock").split("/");
    const ghpUrl = `https://${owner.toLowerCase()}.github.io/${repo_name}/${env.browser}${env.stream === "beta" ? "-beta" : ""}/${version}/`;
    // make a request to the url and check if we got redirected
    // firefox doesn't seem to like getting redirected on a source map request
    try {
        const resp = await fetch(ghpUrl);
        return resp.url;
    } catch {
        return ghpUrl;
    }
}

module.exports = async env => {
    let mode = "production";
    env.mode = mode;

    return merge(common(env), {
        mode,
        ...(env.ghpSourceMaps
            ? {
                devtool: false,
                plugins: [new SourceMapDevToolPlugin({
                    publicPath: await createGHPSourceMapURL(env),
                    filename: '[file].map[query]',
                })],
            }
            : {
                devtool: "source-map",
            }
        ),
    });
};
