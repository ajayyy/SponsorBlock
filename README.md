# Source maps for SponsorBlock

This branch contains an archive of extension source maps since they were enabled for production builds.
Source maps for old extension versions may be deleted in the future.

This branch is completely separate from the master branch and all other development branches - [see the master branch to view the latest source code](https://github.com/ajayyy/SponsorBlock/tree/master).

The directory structure of this repository is as follows:
```
/
├── chrome
│   └── <version>
│       └── .js.map files
├── chrome-beta
│   └── <version>
│       └── .js.map files
├── edge
│   └── <version>
│       └── .js.map files
├── firefox
│   └── <version>
│       └── .js.map files
├── firefox-beta
│   └── <version>
│       └── .js.map files
└── safari
    └── <version>
        └── .js.map files
```

This structure is also served with GitHub Pages at https://ajayyy.github.io/SponsorBlock/ - this is where the extensions will be attempting to fetch the maps from.
