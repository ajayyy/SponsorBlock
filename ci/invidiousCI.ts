import { InvidiousInstance, monitor } from "./invidiousType"

import * as data from "../ci/invidious_instances.json";

// only https servers
const mapped = (data as InvidiousInstance[])
  .filter((i) =>
    i[1]?.type === "https"
    && i[1]?.monitor?.enabled
  )
  .map((instance) => {
    const monitor = instance[1].monitor as monitor;
    return {
      name: instance[0],
      url: instance[1].uri,
      uptime: monitor.uptime || 0,
      down: monitor.down ?? false,
      created_at: monitor.created_at,
    }
  });

// reliability and sanity checks
const reliableCheck = mapped
  .filter(instance => {
    const uptime = instance.uptime > 80 && !instance.down;
    const nameIncluded = instance.url.includes(instance.name);
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;
    const ninetyDaysAgo = new Date(Date.now() - ninetyDays);
    const createdAt = new Date(instance.created_at).getTime() < ninetyDaysAgo.getTime();
    return uptime && nameIncluded && createdAt;
  })

export const getInvidiousList = (): string[] =>
  reliableCheck.map(instance => instance.name).sort()