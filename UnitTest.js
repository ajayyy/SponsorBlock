// Check/s should passed before a change is accepted
// This should be automated via CI

const Videos = [
    { input: "https://www.youtube-nocookie.com/embed/wJuWuJBbc1s", result: "wJuWuJBbc1s" },
    { input: "https://www.youtube-nocookie.com/embed/blah", result: false },
    { input: "https://www.youtube-nocookie.com/embed/wJuWuJBbc1s#example", result: "wJuWuJBbc1s" },
    { input: "https://www.youtube-nocookie.com/em0bed/wJuWuJBbc1s", result: false },
    { input: "https://www.youtube.com/watch?v=wJuWuJBbc1s#example", result: "wJuWuJBbc1s" },
    { input: "https://www.youtube.com/watch?v=wJuWuJBbc1sX", result: "wJuWuJBbc1s" },
    { input: "https://www.youtube.com/watch?v=wJuWuJBbc1s", result: "wJuWuJBbc1s" },
    { input: "https://www.youtube.com/watch/?v=wJuWuJBbc1s", result: "wJuWuJBbc1s" },
    { input: "https://www.youtube.com/embed/wJuWuJBbc1s", result: "wJuWuJBbc1s" },
    { input: "https://www.youtube.com/embed/wJuWuJBbc1s/", result: "wJuWuJBbc1s" },
    { input: "https://www.youtube.com/embed/wJuWuJBbc1s?aaa=aaa", result: "wJuWuJBbc1s" },
    { input: "https://www.youtube.com/watch?v=wJuWuJBbc1s&aaa=aaa", result: "wJuWuJBbc1s" },
    { input: "https://www.youtube.com/watch?time_continue=2&v=wJuWuJBbc1s", result: "wJuWuJBbc1s" },
    { input: "https://www.youtube.com/watch?time_continue=2&v=wJuWuJBbc1s&aaa=aaa", result: "wJuWuJBbc1s" },
    { input: "https://www.notyoutube.com/watch?v=wJuWuJBbc1s", result: false },
    { input: "https://www.youtube.com.notyoutube.com/watch?v=wJuWuJBbc1s", result: false },
    { input: "https://www.notyoutube.com/embed/wJuWuJBbc1s", result: false },
    { input: "https://www.youtube.com/watch?v=badurl", result: false },
    { input: "https://www.youtube.com/embed/badurl", result: false },
    { input: "https://www.youtube.com.notyoutube.com/embed/wJuWuJBbc1s", result: false },
    { input: "https://www.youtube-nocookie.com/embed/wJuWuJBbc1s", result: "wJuWuJBbc1s" },
    { input: "https://www.youtube-nocookie.com/watch?v=wJuWuJBbc1s", result: "wJuWuJBbc1s" }
];


function runALL() {
    let pass = (GetVideoID()) // Run tests
    (pass) ? console.log("ALL TEST PASSED :D") : console.error("TEST FAILED :D");
}

function getVideoID() {
    Videos.forEach(Video => {
        if (getYouTubeVideoID(Video.input) !== Video.result) {
            console.error("GetVideoID check failed at " + Video.input + " expected " + Video.result);
            return false;
        };
    });
    console.log("GetVideoID check passed :D");
    return true;
}
