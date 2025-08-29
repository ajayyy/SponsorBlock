/* eslint-disable @typescript-eslint/no-var-requires */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const webpack = require("webpack");
const path = require('path');
const { validate } = require('schema-utils');
const fs = require('fs');

const manifest = require("../manifest/manifest.json");
const firefoxManifestExtra = require("../manifest/firefox-manifest-extra.json");
const chromeManifestExtra = require("../manifest/chrome-manifest-extra.json");
const safariManifestExtra = require("../manifest/safari-manifest-extra.json");
const betaManifestExtra = require("../manifest/beta-manifest-extra.json");
const firefoxBetaManifestExtra = require("../manifest/firefox-beta-manifest-extra.json");
const manifestV2ManifestExtra = require("../manifest/manifest-v2-extra.json");

// schema for options object
const schema = {
    type: 'object',
    properties: {
        browser: {
            type: 'string'
        },
        pretty: {
            type: 'boolean'
        },
        stream: {
            type: 'string'
        },
        autoupdate: {
            type: 'boolean',
        }
    }
};

class BuildManifest {
    constructor (options = {}) {
        validate(schema, options, "Build Manifest Plugin");

        this.options = options;
    }

    apply() {
        const distFolder = path.resolve(__dirname, "../dist/");
        const distManifestFile = path.resolve(distFolder, "manifest.json");
        const [owner, repo_name] = (process.env.GITHUB_REPOSITORY ?? "ajayyy/SponsorBlock").split("/");

        // Add missing manifest elements
        if (this.options.browser.toLowerCase() === "firefox") {
            mergeObjects(manifest, manifestV2ManifestExtra);
            mergeObjects(manifest, firefoxManifestExtra);
        } else if (this.options.browser.toLowerCase() === "chrome" 
                || this.options.browser.toLowerCase() === "chromium"
                || this.options.browser.toLowerCase() === "edge") {
            mergeObjects(manifest, chromeManifestExtra);
        }  else if (this.options.browser.toLowerCase() === "safari") {
            mergeObjects(manifest, manifestV2ManifestExtra);
            mergeObjects(manifest, safariManifestExtra);
            manifest.optional_permissions = manifest.optional_permissions.filter((a) => a !== "*://*/*");
        }

        if (this.options.stream === "beta") {
            mergeObjects(manifest, betaManifestExtra);

            if (this.options.browser.toLowerCase() === "firefox") {
                mergeObjects(manifest, firefoxBetaManifestExtra);
            }
        }

        if (this.options.autoupdate === true && this.options.browser.toLowerCase() === "firefox") {
            manifest.browser_specific_settings.gecko.update_url = `https://${owner.toLowerCase()}.github.io/${repo_name}/updates.json`;
        }

        let result = JSON.stringify(manifest);
        if (this.options.pretty) result = JSON.stringify(manifest, null, 2);

        fs.mkdirSync(distFolder, {recursive: true});
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
