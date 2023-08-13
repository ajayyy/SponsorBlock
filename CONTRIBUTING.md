If you make any contributions to SponsorBlock after this file was created, you are agreeing that any code you have contributed will be licensed under LGPL-3.0 or later.

# Translations
https://crowdin.com/project/sponsorblock

# Building
## Building locally
0. You must have [Node.js 16 or later](https://nodejs.org/) and npm installed. Works best on Linux
1. Clone with submodules
  ```bash
  git clone --recursive https://github.com/ajayyy/SponsorBlock
  ```
  Or if you already cloned it, pull submodules with
  ```bash
  git submodule update --init --recursive
  ```
2. Copy the file `config.json.example` to `config.json` and adjust configuration as desired.
  - Comments are invalid in JSON, make sure they are all removed.
  - You will need to repeat this step in the future if you get build errors related to `CompileConfig` or `property does not exist on type ConfigClass`. This can happen for example when a new category is added.
3. Run `npm ci` in the repository to install dependencies.
4. Run `npm run build:dev` (for Chrome) or `npm run build:dev:firefox` (for Firefox) to generate a development version of the extension with source maps.
    - You can also run `npm run build` (for Chrome) or `npm run build:firefox` (for Firefox) to generate a production build.
5. The built extension is now in `dist/`. You can load this folder directly in Chrome as an [unpacked extension](https://developer.chrome.com/docs/extensions/mv3/getstarted/#manifest), or convert it to a zip file to load it as a [temporary extension](https://developer.mozilla.org/docs/Tools/about:debugging#loading_a_temporary_extension) in Firefox.

## Developing with a clean profile and hot reloading
Run `npm run dev` (for Chrome) or `npm run dev:firefox` (for Firefox) to run the extension using a clean browser profile with hot reloading. This uses [`web-ext run`](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/#commands).

Known chromium bug: Extension is not loaded properly on first start. Visit `chrome://extensions/` and reload the extension.

For Firefox for Android, use `npm run dev:firefox-android -- --adb-device <ip-address of the device>`. See the [Firefox documentation](https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/#debug-your-extension) for more information. You may need to edit package.json and add the parameters directly there.

