/*
This file is only ran by GitHub Actions in order to populate the Invidious instances list

This file should not be shipped with the extension
*/

/*
Criteria for inclusion:
Invidious
- 30d uptime >= 90%
- available for at least 80/90 days
- must have been up for at least 90 days
- HTTPS only
- url includes name (this is to avoid redirects)

Piped
- 30d uptime >= 90%
- available for at least 80/90 days
- must have been up for at least 90 days
- must not be a wildcard redirect to piped.video
- must be currently up
- must have a functioning frontend
- must have a functioning API
*/

import { writeFile, existsSync } from "fs"
import { join } from "path"
import { getInvidiousList } from "./invidiousCI";
// import { getPipedList } from "./pipedCI";

const checkPath = (path: string) => existsSync(path);
const fixArray = (arr: string[]) => [...new Set(arr)].sort()

async function generateList() {
  // import file from https://api.invidious.io/instances.json
  const invidiousPath = join(__dirname, "invidious_instances.json");
  // import file from https://github.com/TeamPiped/piped-uptime/raw/master/history/summary.json
  const pipedPath = join(__dirname, "piped_instances.json");

  // check if files exist
  if (!checkPath(invidiousPath) || !checkPath(pipedPath)) {
    console.log("Missing files")
    process.exit(1);
  }

  // static non-invidious instances
  const staticInstances = ["www.youtubekids.com"];
  // invidious instances
  const invidiousList = fixArray(getInvidiousList())
  // piped instnaces
  // const pipedList = fixArray(await getPipedList())

  console.log([...staticInstances, ...invidiousList])

  writeFile(
    join(__dirname, "./invidiouslist.json"),
    JSON.stringify([...staticInstances, ...invidiousList]),
    (err) => {
      if (err) return console.log(err);
    }
  );
}
generateList()
