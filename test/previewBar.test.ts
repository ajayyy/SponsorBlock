import PreviewBar, { PreviewBarSegment } from "../src/js-components/previewBar";

describe("createChapterRenderGroups", () => {
    let previewBar: PreviewBar;
    beforeEach(() => {
        previewBar = new PreviewBar(null, null, null, null, true);
    })

    it("Two unrelated times", () => {
        previewBar.videoDuration = 315;
        const groups = previewBar.createChapterRenderGroups([{
            segment: [2, 30],
            category: "sponsor",
            unsubmitted: false,
            showLarger: false,
            description: ""
        }, {
            segment: [50, 80],
            category: "sponsor",
            unsubmitted: false,
            showLarger: false,
            description: ""
        }] as PreviewBarSegment[]);

        expect(groups).toStrictEqual([{
            segment: [0, 2],
            originalDuration: 0
        }, {
            segment: [2, 30],
            originalDuration: 30 - 2
        }, {
            segment: [30, 50],
            originalDuration: 0
        }, {
            segment: [50, 80],
            originalDuration: 80 - 50
        }, {
            segment: [80, 315],
            originalDuration: 0
        }]);
    });

    it("Small time in bigger time", () => {
        previewBar.videoDuration = 315;
        const groups = previewBar.createChapterRenderGroups([{
            segment: [2.52, 30],
            category: "sponsor",
            unsubmitted: false,
            showLarger: false,
            description: ""
        }, {
            segment: [20, 25],
            category: "sponsor",
            unsubmitted: false,
            showLarger: false,
            description: ""
        }] as PreviewBarSegment[]);

        expect(groups).toStrictEqual([{
            segment: [0, 2.52],
            originalDuration: 0
        }, {
            segment: [2.52, 20],
            originalDuration: 30 - 2.52
        }, {
            segment: [20, 25],
            originalDuration: 25 - 20
        }, {
            segment: [25, 30],
            originalDuration: 30 - 2.52
        }, {
            segment: [30, 315],
            originalDuration: 0
        }]);
    });

    it("Same start time", () => {
        previewBar.videoDuration = 315;
        const groups = previewBar.createChapterRenderGroups([{
            segment: [2.52, 30],
            category: "sponsor",
            unsubmitted: false,
            showLarger: false,
            description: ""
        }, {
            segment: [2.52, 40],
            category: "sponsor",
            unsubmitted: false,
            showLarger: false,
            description: ""
        }] as PreviewBarSegment[]);

        expect(groups).toStrictEqual([{
            segment: [0, 2.52],
            originalDuration: 0
        }, {
            segment: [2.52, 30],
            originalDuration: 30 - 2.52
        }, {
            segment: [30, 40],
            originalDuration: 40 - 2.52
        }, {
            segment: [40, 315],
            originalDuration: 0
        }]);
    });

    it("Lots of overlapping segments", () => {
        previewBar.videoDuration = 315.061;
        const groups = previewBar.createChapterRenderGroups([
            {
                "category": "chapter",
                "segment": [
                    0,
                    49.977
                ],
                "locked": 0,
                "votes": 0,
                "videoDuration": 315.061,
                "userID": "b1919787a85cd422af07136a913830eda1364d32e8a9e12104cf5e3bad8f6f45",
                "description": "Start of video"
            },
            {
                "category": "sponsor",
                "segment": [
                    2.926,
                    5
                ],
                "locked": 1,
                "votes": 2,
                "videoDuration": 316,
                "userID": "938444fccfdb7272fd871b7f98c27ea9e5e806681db421bb69452e6a42730c20",
                "description": ""
            },
            {
                "category": "chapter",
                "segment": [
                    14.487,
                    37.133
                ],
                "locked": 0,
                "votes": 0,
                "videoDuration": 315.061,
                "userID": "b1919787a85cd422af07136a913830eda1364d32e8a9e12104cf5e3bad8f6f45",
                "description": "Subset of start"
            },
            {
                "category": "sponsor",
                "segment": [
                    23.450537,
                    34.486084
                ],
                "locked": 0,
                "votes": -1,
                "videoDuration": 315.061,
                "userID": "938444fccfdb7272fd871b7f98c27ea9e5e806681db421bb69452e6a42730c20",
                "description": ""
            },
            {
                "category": "interaction",
                "segment": [
                    50.015343,
                    56.775314
                ],
                "locked": 0,
                "votes": 0,
                "videoDuration": 315.061,
                "userID": "b2a85e8cdfbf21dd504babbcaca7f751b55a5a2df8179c1a83a121d0f5d56c0e",
                "description": ""
            },
            {
                "category": "sponsor",
                "segment": [
                    62.51888,
                    74.33331
                ],
                "locked": 0,
                "votes": -1,
                "videoDuration": 316,
                "userID": "938444fccfdb7272fd871b7f98c27ea9e5e806681db421bb69452e6a42730c20",
                "description": ""
            },
            {
                "category": "sponsor",
                "segment": [
                    88.71328,
                    96.05933
                ],
                "locked": 0,
                "votes": 0,
                "videoDuration": 315.061,
                "userID": "6c08c092db2b7a31210717cc1f2652e7e97d032e03c82b029a27c81cead1f90c",
                "description": ""
            },
            {
                "category": "sponsor",
                "segment": [
                    101.50703,
                    115.088326
                ],
                "votes": 0,
                "videoDuration": 315.061,
                "userID": "2db207ad4b7a535a548fab293f4567bf97373997e67aadb47df8f91b673f6e53",
                "description": ""
            },
            {
                "category": "sponsor",
                "segment": [
                    122.211845,
                    137.42178
                ],
                "locked": 0,
                "votes": 1,
                "videoDuration": 0,
                "userID": "0312cbfa514d9d2dfb737816dc45f52aba7c23f0a3f0911273a6993b2cb57fcc",
                "description": ""
            },
            {
                "category": "sponsor",
                "segment": [
                    144.08913,
                    160.14084
                ],
                "locked": 0,
                "votes": -1,
                "videoDuration": 316,
                "userID": "938444fccfdb7272fd871b7f98c27ea9e5e806681db421bb69452e6a42730c20",
                "description": ""
            },
            {
                "category": "sponsor",
                "segment": [
                    164.22084,
                    170.98082
                ],
                "locked": 0,
                "votes": 0,
                "videoDuration": 315.061,
                "userID": "845c4377060d5801f5324f8e1be1e8373bfd9addcf6c68fc5a3c038111b506a3",
                "description": ""
            },
            {
                "category": "sponsor",
                "segment": [
                    180.56674,
                    189.16516
                ],
                "locked": 0,
                "votes": -1,
                "videoDuration": 315.061,
                "userID": "7c6b015687db7800c05756a0fd226fd8d101f5a1e1bfb1e5d97c440331fd6cb7",
                "description": ""
            },
            {
                "category": "sponsor",
                "segment": [
                    204.10468,
                    211.87865
                ],
                "locked": 0,
                "votes": 0,
                "videoDuration": 315.061,
                "userID": "3472e8ee00b5da957377ae32d59ddd3095c2b634c2c0c970dfabfb81d143699f",
                "description": ""
            },
            {
                "category": "sponsor",
                "segment": [
                    214.92064,
                    222.0186
                ],
                "locked": 0,
                "votes": 0,
                "videoDuration": 0,
                "userID": "62a00dffb344d27de7adf8ea32801c2fc0580087dc8d282837923e4bda6a1745",
                "description": ""
            },
            {
                "category": "sponsor",
                "segment": [
                    233.0754,
                    244.56734
                ],
                "locked": 0,
                "votes": -1,
                "videoDuration": 315,
                "userID": "dcf7fb0a6c071d5a93273ebcbecaee566e0ff98181057a36ed855e9b92bf25ea",
                "description": ""
            },
            {
                "category": "sponsor",
                "segment": [
                    260.64053,
                    269.35938
                ],
                "locked": 0,
                "votes": 0,
                "videoDuration": 315.061,
                "userID": "e0238059ae4e711567af5b08a3afecfe45601c995b0ea2f37ca43f15fca4e298",
                "description": ""
            },
            {
                "category": "sponsor",
                "segment": [
                    288.686,
                    301.96
                ],
                "locked": 0,
                "votes": 0,
                "videoDuration": 315.061,
                "userID": "e0238059ae4e711567af5b08a3afecfe45601c995b0ea2f37ca43f15fca4e298",
                "description": ""
            },
            {
                "category": "sponsor",
                "segment": [
                    288.686,
                    295
                ],
                "locked": 0,
                "votes": 0,
                "videoDuration": 315.061,
                "userID": "e0238059ae4e711567af5b08a3afecfe45601c995b0ea2f37ca43f15fca4e298",
                "description": ""
            }] as unknown as PreviewBarSegment[]);

        expect(groups).toStrictEqual([
            {
                "segment": [
                    0,
                    2.926
                ],
                "originalDuration": 49.977
            },
            {
                "segment": [
                    2.926,
                    5
                ],
                "originalDuration": 2.074
            },
            {
                "segment": [
                    5,
                    14.487
                ],
                "originalDuration": 49.977
            },
            {
                "segment": [
                    14.487,
                    23.450537
                ],
                "originalDuration": 22.646
            },
            {
                "segment": [
                    23.450537,
                    34.486084
                ],
                "originalDuration": 11.035546999999998
            },
            {
                "segment": [
                    34.486084,
                    37.133
                ],
                "originalDuration": 22.646
            },
            {
                "segment": [
                    37.133,
                    49.977
                ],
                "originalDuration": 49.977
            },
            {
                "segment": [
                    49.977,
                    50.015343
                ],
                "originalDuration": 0
            },
            {
                "segment": [
                    50.015343,
                    56.775314
                ],
                "originalDuration": 6.759971
            },
            {
                "segment": [
                    56.775314,
                    62.51888
                ],
                "originalDuration": 0
            },
            {
                "segment": [
                    62.51888,
                    74.33331
                ],
                "originalDuration": 11.814429999999994
            },
            {
                "segment": [
                    74.33331,
                    88.71328
                ],
                "originalDuration": 0
            },
            {
                "segment": [
                    88.71328,
                    96.05933
                ],
                "originalDuration": 7.346050000000005
            },
            {
                "segment": [
                    96.05933,
                    101.50703
                ],
                "originalDuration": 0
            },
            {
                "segment": [
                    101.50703,
                    115.088326
                ],
                "originalDuration": 13.581295999999995
            },
            {
                "segment": [
                    115.088326,
                    122.211845
                ],
                "originalDuration": 0
            },
            {
                "segment": [
                    122.211845,
                    137.42178
                ],
                "originalDuration": 15.209935000000016
            },
            {
                "segment": [
                    137.42178,
                    144.08913
                ],
                "originalDuration": 0
            },
            {
                "segment": [
                    144.08913,
                    160.14084
                ],
                "originalDuration": 16.051709999999986
            },
            {
                "segment": [
                    160.14084,
                    164.22084
                ],
                "originalDuration": 0
            },
            {
                "segment": [
                    164.22084,
                    170.98082
                ],
                "originalDuration": 6.759979999999985
            },
            {
                "segment": [
                    170.98082,
                    180.56674
                ],
                "originalDuration": 0
            },
            {
                "segment": [
                    180.56674,
                    189.16516
                ],
                "originalDuration": 8.598419999999976
            },
            {
                "segment": [
                    189.16516,
                    204.10468
                ],
                "originalDuration": 0
            },
            {
                "segment": [
                    204.10468,
                    211.87865
                ],
                "originalDuration": 7.773969999999991
            },
            {
                "segment": [
                    211.87865,
                    214.92064
                ],
                "originalDuration": 0
            },
            {
                "segment": [
                    214.92064,
                    222.0186
                ],
                "originalDuration": 7.0979600000000005
            },
            {
                "segment": [
                    222.0186,
                    233.0754
                ],
                "originalDuration": 0
            },
            {
                "segment": [
                    233.0754,
                    244.56734
                ],
                "originalDuration": 11.49194
            },
            {
                "segment": [
                    244.56734,
                    260.64053
                ],
                "originalDuration": 0
            },
            {
                "segment": [
                    260.64053,
                    269.35938
                ],
                "originalDuration": 8.718849999999975
            },
            {
                "segment": [
                    269.35938,
                    288.686
                ],
                "originalDuration": 0
            },
            {
                "segment": [
                    288.686,
                    295
                ],
                "originalDuration": 6.314000000000021
            },
            {
                "segment": [
                    295,
                    301.96
                ],
                "originalDuration": 13.274000000000001
            },
            {
                "segment": [
                    301.96,
                    315.061
                ],
                "originalDuration": 0
            }
        ]);
    })

    it("Multiple overlapping", () => {
        previewBar.videoDuration = 3615.161;
        const groups = previewBar.createChapterRenderGroups([{
                "segment": [
                    160,
                    2797.323
                ],
                "category": "chooseACategory",
                "unsubmitted": true,
                "showLarger": false,
            },{
                "segment": [
                    169,
                    3432.255
                ],
                "category": "chooseACategory",
                "unsubmitted": true,
                "showLarger": false,
            },{
                "segment": [
                    169,
                    3412.413
                ],
                "category": "chooseACategory",
                "unsubmitted": true,
                "showLarger": false,
            },{
                "segment": [
                    1594.92,
                    1674.286
                ],
                "category": "sponsor",
                "unsubmitted": false,
                "showLarger": false,
            }
        ] as unknown as PreviewBarSegment[]);

        expect(groups).toStrictEqual([
            {
                "segment": [
                    0,
                    160
                ],
                "originalDuration": 0
            },
            {
                "segment": [
                    160,
                    169
                ],
                "originalDuration": 2637.323
            },
            {
                "segment": [
                    169,
                    1594.92
                ],
                "originalDuration": 3243.413
            },
            {
                "segment": [
                    1594.92,
                    1674.286
                ],
                "originalDuration": 79.36599999999999
            },
            {
                "segment": [
                    1674.286,
                    3412.413
                ],
                "originalDuration": 3243.413
            },
            {
                "segment": [
                    3412.413,
                    3432.255
                ],
                "originalDuration": 3263.255
            },
            {
                "segment": [
                    3432.255,
                    3615.161
                ],
                "originalDuration": 0
            }
        ]);
    });
})