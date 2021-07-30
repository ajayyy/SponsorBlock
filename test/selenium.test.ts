import { Builder, By, until, Key } from "selenium-webdriver";
import * as Chrome from "selenium-webdriver/chrome";
import * as Path from "path";

test("Selenium Chrome test", async () => {
    const options = new Chrome.Options();
    options.addArguments("--load-extension=" + Path.join(__dirname, "../dist/"));
    options.addArguments("--mute-audio");
    options.addArguments("--disable-features=PreloadMediaEngagementData, MediaEngagementBypassAutoplayPolicies")

    const driver = await new Builder().forBrowser("chrome").setChromeOptions(options).build();
    driver.manage().setTimeouts({
        implicit: 5000
    });

    try {
        // Selenium only knows about the one tab it's on,
        // so we can't wait for the help page to appear
        await driver.sleep(3000);
        // This video has no ads
        await driver.get("https://www.youtube.com/watch?v=jNQXAC9IVRw");
        await driver.wait(until.elementIsVisible(await driver.findElement(By.className("ytd-video-primary-info-renderer"))));

        const startSegmentButton = await driver.findElement(By.id("startSegmentButton"));
        const cancelSegmentButton = await driver.findElement(By.id("cancelSegmentButton"));
        await driver.executeScript("document.querySelector('video').currentTime = 0");

        await startSegmentButton.click();
        await driver.wait(until.elementIsVisible(cancelSegmentButton));

        await driver.executeScript("document.querySelector('video').currentTime = 10.33");

        await startSegmentButton.click();
        await driver.wait(until.elementIsNotVisible(cancelSegmentButton));

        const submitButton = await driver.findElement(By.id("submitButton"));
        await submitButton.click();

        const sponsorTimeDisplay = await driver.findElement(By.className("sponsorTimeDisplay"));
        await driver.wait(until.elementTextIs(sponsorTimeDisplay, "0:00.000 to 0:10.330"));
    } finally {
        await driver.quit();
    }
}, 100_000);