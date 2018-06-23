var v = document.querySelector('video')
video_id = youtube_parser(document.URL);

if (video_id) {
    SponsorsLookup(video_id);
}

function SponsorsLookup(id) {
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

function youtube_parser(url) {
    var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
    var match = url.match(regExp);
    return (match && match[7].length == 11) ? match[7] : false;
}
