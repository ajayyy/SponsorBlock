/* eslint-disable @typescript-eslint/no-var-requires */
const { readFile } = require("fs/promises")
let logger;

const readFileContents = (name) => readFile(name)
  .then(data => JSON.parse(data))

// partialDeepEquals from ajayyy/SponsorBlockServer
function partialDeepEquals (actual, expected, logger) {
  // loop over key, value of expected
  let failed = false;
  for (const [ key, value ] of Object.entries(expected)) {
    if (key === "serverAddress" || key === "testingServerAddress" || key === "serverAddressComment" || key === "freeChapterAccess") continue
    // if value is object, recurse
    const actualValue = actual?.[key]
    if (typeof value !== "string" && Array.isArray(value)) {
      if (!arrayPartialDeepEquals(actualValue, value)) {
        printActualExpected(key, actualValue, value, logger)
        failed = true
      }
    } else if (typeof value === "object") {
      if (partialDeepEquals(actualValue, value, logger)) {
        console.log("obj failed")
        printActualExpected(key, actualValue, value, logger)
        failed = true
      }
    } else if (actualValue !== value) {
      printActualExpected(key, actualValue, value, logger)
      failed = true
    }
  }
  return failed
}

const arrayPartialDeepEquals = (actual, expected) =>
  expected.every(a => actual?.includes(a))

function printActualExpected(key, actual, expected, logger) {
  logger.error(`Differing value for: ${key}`)
  logger.error(`Actual: ${JSON.stringify(actual)}`)
  logger.error(`Expected: ${JSON.stringify(expected)}`)
}

class configDiffPlugin {
  apply(compiler) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    compiler.hooks.done.tapAsync("configDiffPlugin", async (stats, callback) => {
      logger = compiler.getInfrastructureLogger('configDiffPlugin')
      logger.log('Checking for config.json diff...')
      
      // check example
      const exampleConfig = await readFileContents("./config.json.example")
      const currentConfig = await readFileContents("./config.json")

      const difference = partialDeepEquals(currentConfig, exampleConfig, logger)
      if (difference) {
        logger.warn("config.json is missing values from config.json.example")
      } else {
        logger.info("config.json is not missing any values from config.json.example")
      }
      callback()
    })
  }
}

module.exports = configDiffPlugin;
