# SponsorBlocker

SponsorBlocker is an extension that will skip over sponsored segments of YouTube videos. SponsorBlocker is a crowdsourced browser extension that let's anyone submit the start and end time's of sponsored segments of YouTube videos. Once one person submits this information, everyone else with this extension will skip right over the sponsored segment.

# Server

The backend server code is available here: https://github.com/ajayyy/SponsorBlockServer

It is a simple Sqlite database that will hold all the timing data.

To make sure that this project doesn't die, I have made the database publicly downloadable at https://sponsor.ajay.app/database.db. So, you can download a backup or get archive.org to take a backup if you do desire.

Hopefully this project can be combined with projects like [this](https://github.com/Sponsoff/sponsorship_remover) and use this data to create a neural network to predict when sponsored segments happen. That project is sadly abandoned now, so I have decided to attempt to revive this space.

# Previous extension

This project is partially based off of [this experimental extention](https://github.com/OfficialNoob/YTSponsorSkip). That extension has the basic video skipping functionality.

# Chrome extension

It will be on the chrome webstore soon once I get some more UI features in, such as an icon. For now, you can load this project as an unpacked extension. Make sure to rename the `content-config.js.example` file to `content-config.js` before installing.

# Firefox extension

None at the moment
