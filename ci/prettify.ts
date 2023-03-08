import { writeFile } from 'fs';

import * as license from "../oss-attribution/licenseInfos.json";

const result = JSON.stringify(license, null, 2);
writeFile("../oss-attribution/licenseInfos.json", result, err => { if (err) return console.log(err) } );