export function cleanPage() {
    // For live-updates
    if (document.readyState === "complete") {
        for (const element of document.querySelectorAll("#categoryPillParent, .playerButton, .sponsorThumbnailLabel, #submissionNoticeContainer, .sponsorSkipNoticeContainer, #sponsorBlockPopupContainer, .skipButtonControlBarContainer, #previewbar, .sponsorBlockChapterBar")) {
            element.remove();
        }
    }
}