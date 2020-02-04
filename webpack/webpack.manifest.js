const webpack = require("webpack");
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const validateOptions = require('schema-utils');

const fs = require('fs');

const manifest = require("../manifest/manifest.json");
const firefoxManifestExtra = require("../manifest/firefox-manifest-extra.json");
const chromeManifestExtra = require("../manifest/chrome-manifest-extra.json");

// schema for options object
const schema = {
    type: 'object',
    properties: {
        browser: {
            type: 'string'
        },
        pretty: {
            type: 'boolean'
        }
    }  
};

class BuildManifest {
    constructor (options = {}) {
        validateOptions(schema, options, "Build Manifest Plugin");

        this.options = options;
    }

    apply(compiler) {
        const distManifestFile = path.resolve(__dirname, "../dist/manifest.json");

        // Add missing manifest elements
        if (this.options.browser.toLowerCase() === "firefox") {
            mergeObjects(manifest, firefoxManifestExtra);
        } else if (this.options.browser.toLowerCase() === "chrome" || this.options.browser.toLowerCase() === "chromium") {
            mergeObjects(manifest, chromeManifestExtra);
        }

        let result = JSON.stringify(manifest);
        if (this.options.pretty) result = JSON.stringify(manifest, null, 2);

        fs.mkdirSync(distManifestFile);
        fs.writeFileSync(distManifestFile, result);
    }
}

function mergeObjects(object1, object2) {
    for (const key in object2) {
        if (key in object1) {
            if (Array.isArray(object1[key])) {
                object1[key] = object1[key].concat(object2[key]);
            } else if (typeof object1[key] == 'object') {
                mergeObjects(object1[key], object2[key]);
            } else {
                object1[key] = object2[key];
            }
        } else {
            object1[key] = object2[key];
        }
    }
}

module.exports = BuildManifest;