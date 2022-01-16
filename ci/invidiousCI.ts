/*
This file is only ran by GitHub Actions in order to populate the Invidious instances list

This file should not be shipped with the extension
*/

import { writeFile, existsSync } from 'fs';
import { join } from 'path';

// import file from https://api.invidious.io/instances.json
if (!existsSync('./data.json')) {
  process.exit(1);
}
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import * as data from "./data.json";

type instanceMap = {
  name: string,
  url: string,
  dailyRatios: {ratio: string, label: string }[],
  thirtyDayUptime: string
}[]

// only https servers
const mapped: instanceMap = data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .filter((i: any) => i[1]?.type === 'https')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .map((instance: any) => {
    return {
      name: instance[0],
      url: instance[1].uri,
      dailyRatios: instance[1].monitor.dailyRatios,
      thirtyDayUptime: instance[1]?.monitor['30dRatio'].ratio,
    }
  })

// reliability and sanity checks
const reliableCheck = mapped
  .filter((instance) => {
    // 30d uptime >= 90%
    const thirtyDayUptime = Number(instance.thirtyDayUptime) >= 90
    // available for at least 80/90 days
    const dailyRatioCheck = instance.dailyRatios.filter(status => status.label !== "black")
    return (thirtyDayUptime && dailyRatioCheck.length >= 80)
  })
  // url includes name
  .filter(instance => instance.url.includes(instance.name))

// finally map to array
const result: string[] = reliableCheck.map(instance => instance.name)
writeFile(join(__dirname, "./invidiouslist.json"), JSON.stringify(result), (err) => {
  if (err) return console.log(err);
})