<p align="center">
  <a href="https://sponsor.ajay.app"><img src="public/icons/LogoSponsorBlocker256px.png" alt="Logo"></img></a>
  
  <br/>
  <sub>Logo by <a href="https://github.com/munadikieh">@munadikieh</a></sub>
</p>

<h1 align="center">SponsorBlock</h1>

<p align="center">
  <b>Download:</b>
  <a href="https://chrome.google.com/webstore/detail/mnjggcdmjocbbbhaepdhchncahnbgone">Chrome/Chromium</a> |
  <a href="https://addons.mozilla.org/addon/sponsorblock/?src=external-github">Firefox</a> |
  <a href="https://sponsor.ajay.app">Website</a> |
  <a href="https://sponsor.ajay.app/stats">Stats</a>
</p>

<p align="center">
  <b>Unofficial Ports:</b>
  <a href="https://github.com/ajayyy/SponsorBlock/wiki/Unofficial-Ports#mpv-media-player">MPV</a>
</p>

<p align="center">
    <a href="https://addons.mozilla.org/addon/sponsorblock/?src=external-github"><img src="https://img.shields.io/amo/users/sponsorblock?label=Firefox%20Users" alt="Badge"></img></a>
    <a href="https://chrome.google.com/webstore/detail/mnjggcdmjocbbbhaepdhchncahnbgone"><img src="https://img.shields.io/chrome-web-store/users/mnjggcdmjocbbbhaepdhchncahnbgone?label=Chome%20Users" alt="Badge"></img></a>
    <a href="https://sponsor.ajay.app/stats"><img src="https://img.shields.io/badge/dynamic/json?label=Sponsors%20Submitted&query=totalSubmissions&suffix=%20sponsors&url=http%3A%2F%2Fsponsor.ajay.app%2Fapi%2FgetTotalStats&color=darkred" alt="Badge"></img></a>
    <a href="https://sponsor.ajay.app/stats"><img src="https://img.shields.io/badge/dynamic/json?label=Contributing%20Users&query=userCount&url=http%3A%2F%2Fsponsor.ajay.app%2Fapi%2FgetTotalStats&color=darkblue" alt="Badge"></img></a>
    <a href="https://sponsor.ajay.app/stats"><img src="https://img.shields.io/badge/dynamic/json?label=Time%20Saved%20From%20Skips&query=daysSaved&url=http%3A%2F%2Fsponsor.ajay.app%2Fapi%2FgetDaysSavedFormatted&color=darkgreen&suffix=%20days" alt="Badge"></img></a>
</p>



SponsorBlock is an extension that will skip over sponsored segments of YouTube videos. SponsorBlock is a crowdsourced browser extension that lets anyone submit the start and end times of sponsored segments of YouTube videos. Once one person submits this information, everyone else with this extension will skip right over the sponsored segment.

Also support Invidio.us.

# Server

The backend server code is available here: https://github.com/ajayyy/SponsorBlockServer

It is a simple Sqlite database that will hold all the timing data.

To make sure that this project doesn't die, I have made the database publicly downloadable at https://sponsor.ajay.app/database.db. You can download a backup or get archive.org to take a backup for you if you want.

The dataset and API are now being used [ports](https://github.com/ajayyy/SponsorBlock/wiki/Unofficial-Ports) as well as a [neural network](https://github.com/andrewzlee/NeuralBlock).

A [previous project attempted to]((https://github.com/Sponsoff/sponsorship_remover) create a neural network to predict when sponsored segments happen. That project is sadly abandoned now, so I have decided to attempt to revive this idea starting from a crowd-sourced system instead.

# API

You can read the API docs [here](https://github.com/ajayyy/SponsorBlockServer#api-docs).

# Building

There are also other build scripts available. Install `npm`, then run `npm install` in the repository to install dependencies. 

Run `npm run build` to generate a Chrome extension.

Use `npm run build:firefox` to generate a Firefox extension.

The result is in `dist`. This can be loaded as an unpacked extension

## Developing with a clean profile

Run `npm run dev` to run the extension using a clean browser profile with hot reloading. Use `npm run dev:firefox` for Firefox. This uses [`web-ext run`](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/#commands).

# Credit

The awesome [Invidious API](https://github.com/omarroth/invidious/wiki/API) previously was used.

Originally forked from [YTSponsorSkip](https://github.com/OfficialNoob/YTSponsorSkip), but zero code remains.

Some icons made by <a href="https://www.flaticon.com/authors/gregor-cresnar" title="Gregor Cresnar">Gregor Cresnar</a> from <a href="https://www.flaticon.com/" title="Flaticon">www.flaticon.com</a> and are licensed by <a href="http://creativecommons.org/licenses/by/3.0/" title="Creative Commons BY 3.0" target="_blank">CC 3.0 BY</a>

Some icons made by <a href="https://www.flaticon.com/authors/freepik" title="Freepik">Freepik</a> from <a href="https://www.flaticon.com/" title="Flaticon">www.flaticon.com</a> are licensed by <a href="http://creativecommons.org/licenses/by/3.0/" title="Creative Commons BY 3.0" target="_blank">CC 3.0 BY</a>
