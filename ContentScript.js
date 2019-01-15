chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (request.message === 'ytvideoid') {
        SponsorsLookup(request.id);
    }
});

function SponsorsLookup(id) {
    v = document.querySelector('video')
    var xmlhttp = new XMLHttpRequest();
    xmlhttp.open('GET', 'https://officialnoob.github.io/YTSponsorSkip-Dataset/' + id, true);
    xmlhttp.onreadystatechange = function () {
        if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
            Sponsors = JSON.parse(xmlhttp.responseText);
            v.ontimeupdate = function () {
                SponsorCheck()
            };
        }
    };
    xmlhttp.send(null);
}

function SponsorCheck() {
    Sponsors.forEach(function (el, index) {
        if ((Math.floor(v.currentTime)) == el[0]) {
            v.currentTime = el[1];
        }
    });
}
