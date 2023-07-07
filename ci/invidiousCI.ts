import { InvidiousInstance, instanceMap } from "./invidiousType"

import * as data from "../ci/invidious_instances.json";

// only https servers
const mapped: instanceMap = data
  .filter((i: InvidiousInstance) => i[1]?.type === "https")
  .map((instance: InvidiousInstance) => {
    return {
      name: instance[0],
      url: instance[1].uri,
      dailyRatios: instance[1].monitor.dailyRatios,
      thirtyDayUptime: instance[1]?.monitor["30dRatio"].ratio,
    }
  });

// reliability and sanity checks
const reliableCheck = mapped
  .filter(instance => {
    // 30d uptime >= 90%
    const thirtyDayUptime = Number(instance.thirtyDayUptime) >= 90;
    // available for at least 80/90 days
    const dailyRatioCheck = instance.dailyRatios.filter(status => status.label !== "black");
    return thirtyDayUptime && dailyRatioCheck.length >= 80;
  })
  // url includes name
  .filter(instance => instance.url.includes(instance.name));

export function getInvidiousList(): string[] {
  return reliableCheck.map(instance => instance.name).sort()
}