export function cleanPage() {
    // For live-updates
    for (const element of document.querySelectorAll("#categoryPillParent, .playerButton, .sponsorThumbnailLabel, #submissionNoticeContainer, .sponsorSkipNoticeContainer, #sponsorBlockPopupContainer, .skipButtonControlBarContainer, #previewbar")) {
        element.remove();
    }
}