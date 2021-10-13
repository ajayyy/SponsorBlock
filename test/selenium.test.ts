import { Builder, By, until, WebDriver } from "selenium-webdriver";
import * as Chrome from "selenium-webdriver/chrome";
import * as Path from "path";

test("Selenium Chrome test", async () => {
    let driver;
    try {
        driver = await setup();   
    } catch (e) {
        console.warn("A browser is probably not installed, skipping selenium tests");
        console.warn(e);

        return;
    }

    try {
        await waitForInstall(driver);
        // This video has no ads
        await goToVideo(driver, "jNQXAC9IVRw");

        await createSegment(driver, "4", "10.33", "0:04.000 to 0:10.330");

        await editSegments(driver, 0, "0:04.000", "0:10.330", "5", "13.211", "0:05.000 to 0:13.211", false);
        await autoskipSegment(driver, 5, 13.211);

        await setSegmentCategory(driver, 0, 1, false);
        await setSegmentActionType(driver, 0, 1, false);
        await editSegments(driver, 0, "0:05.000", "0:13.211", "5", "7.5", "0:05.000 to 0:07.500", false);
        await muteSkipSegment(driver, 5, 7.5);
    } finally {
        await driver.quit();
    }
}, 100_000);

async function setup(): Promise<WebDriver> {
    const options = new Chrome.Options();
    options.addArguments("--load-extension=" + Path.join(__dirname, "../dist/"));
    options.addArguments("--mute-audio");
    options.addArguments("--disable-features=PreloadMediaEngagementData, MediaEngagementBypassAutoplayPolicies");

    const driver = await new Builder().forBrowser("chrome").setChromeOptions(options).build();
    driver.manage().setTimeouts({
        implicit: 5000
    });

    return driver;
}

async function waitForInstall(driver: WebDriver, startingTab = 0): Promise<void> {
    // Selenium only knows about the one tab it's on,
    // so we can't wait for the help page to appear
    await driver.sleep(3000);

    const handles = await driver.getAllWindowHandles();
    await driver.switchTo().window(handles[startingTab]);
}

async function goToVideo(driver: WebDriver, videoId: string): Promise<void> {
    await driver.get("https://www.youtube.com/watch?v=" + videoId);
    await driver.wait(until.elementIsVisible(await driver.findElement(By.className("ytd-video-primary-info-renderer"))));
}

async function createSegment(driver: WebDriver, startTime: string, endTime: string, expectedDisplayedTime: string): Promise<void> {
    const startSegmentButton = await driver.findElement(By.id("startSegmentButton"));
    const cancelSegmentButton = await driver.findElement(By.id("cancelSegmentButton"));
    await driver.executeScript("document.querySelector('video').currentTime = " + startTime);

    await startSegmentButton.click();
    await driver.wait(until.elementIsVisible(cancelSegmentButton));

    await driver.executeScript("document.querySelector('video').currentTime = " + endTime);

    await startSegmentButton.click();
    await driver.wait(until.elementIsNotVisible(cancelSegmentButton));

    const submitButton = await driver.findElement(By.id("submitButton"));
    await submitButton.click();

    const sponsorTimeDisplays = await driver.findElements(By.className("sponsorTimeDisplay"));
    const sponsorTimeDisplay = sponsorTimeDisplays[sponsorTimeDisplays.length - 1];
    await driver.wait(until.elementTextIs(sponsorTimeDisplay, expectedDisplayedTime));
}

async function editSegments(driver: WebDriver, index: number, expectedStartTimeBox: string, expectedEndTimeBox: string,
    startTime: string, endTime: string, expectedDisplayedTime: string, openSubmitBox: boolean): Promise<void> {
    
    if (openSubmitBox) {
        const submitButton = await driver.findElement(By.id("submitButton"));
        await submitButton.click();
    }

    let editButton = await driver.findElement(By.id("sponsorTimeEditButtonSubmissionNotice" + index));
    let sponsorTimeDisplays = await driver.findElements(By.className("sponsorTimeDisplay"));
    let sponsorTimeDisplay = sponsorTimeDisplays[index];
    await sponsorTimeDisplay.click();
    // Ensure edit time appears
    await driver.findElement(By.id("submittingTime0SubmissionNotice" + index));

    // Try the edit button too
    await editButton.click();
    await editButton.click();

    const startTimeBox = await driver.findElement(By.id("submittingTime0SubmissionNotice" + index));
    expect((await startTimeBox.getAttribute("value"))).toBe(expectedStartTimeBox);
    await startTimeBox.clear();
    await startTimeBox.sendKeys(startTime);

    const endTimeBox = await driver.findElement(By.id("submittingTime1SubmissionNotice" + index));
    expect((await endTimeBox.getAttribute("value"))).toBe(expectedEndTimeBox);
    await endTimeBox.clear();
    await endTimeBox.sendKeys(endTime);

    editButton = await driver.findElement(By.id("sponsorTimeEditButtonSubmissionNotice" + index));
    await editButton.click();

    sponsorTimeDisplays = await driver.findElements(By.className("sponsorTimeDisplay"));
    sponsorTimeDisplay = sponsorTimeDisplays[index];
    await driver.wait(until.elementTextIs(sponsorTimeDisplay, expectedDisplayedTime));
}

async function setSegmentCategory(driver: WebDriver, index: number, categoryIndex: number, openSubmitBox: boolean): Promise<void> {
    if (openSubmitBox) {
        const submitButton = await driver.findElement(By.id("submitButton"));
        await submitButton.click();
    }

    const categorySelection = await driver.findElement(By.css(`#sponsorTimeCategoriesSubmissionNotice${index} > option:nth-child(${categoryIndex + 1})`));
    await categorySelection.click();
}

async function setSegmentActionType(driver: WebDriver, index: number, actionTypeIndex: number, openSubmitBox: boolean): Promise<void> {
    if (openSubmitBox) {
        const submitButton = await driver.findElement(By.id("submitButton"));
        await submitButton.click();
    }

    const actionTypeSelection = await driver.findElement(By.css(`#sponsorTimeActionTypesSubmissionNotice${index} > option:nth-child(${actionTypeIndex + 1})`));
    await actionTypeSelection.click();
}

async function autoskipSegment(driver: WebDriver, startTime: number, endTime: number): Promise<void> {
    const video = await driver.findElement(By.css("video"));

    await driver.executeScript("document.querySelector('video').currentTime = " + (startTime - 0.5));
    await driver.executeScript("document.querySelector('video').play()");

    await driver.sleep(1300);
    expect(parseFloat(await video.getAttribute("currentTime"))).toBeGreaterThan(endTime);
    await driver.executeScript("document.querySelector('video').pause()");
}

async function muteSkipSegment(driver: WebDriver, startTime: number, endTime: number): Promise<void> {
    const duration = endTime - startTime;
    const video = await driver.findElement(By.css("video"));

    await driver.executeScript("document.querySelector('video').currentTime = " + (startTime - 0.5));
    await driver.executeScript("document.querySelector('video').play()");

    await driver.sleep(1300);
    expect(await video.getAttribute("muted")).toEqual("true");

    await driver.sleep(duration * 1000 + 300);
    expect(await video.getAttribute("muted")).toBeNull(); // Default is null for some reason
    await driver.executeScript("document.querySelector('video').pause()");
}