import { InvidiousInstance, instanceMap } from "./invidiousType"

import * as data from "../ci/invidious_instances.json";

// only https servers
const mapped: instanceMap = (data as InvidiousInstance[])
  .filter((i) => i[1]?.type === "https")
  .map((instance) => {
    return {
      name: instance[0],
      url: instance[1].uri,
      uptime: instance[1].monitor?.uptime || 0,
      down: instance[1].monitor?.down ?? false
    }
  });

// reliability and sanity checks
const reliableCheck = mapped
  .filter(instance => {
    return instance.uptime > 80 && !instance.down;
  })
  // url includes name
  .filter(instance => instance.url.includes(instance.name));

export function getInvidiousList(): string[] {
  return reliableCheck.map(instance => instance.name).sort()
}