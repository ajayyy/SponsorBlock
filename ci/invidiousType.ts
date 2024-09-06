
export type instanceMap = {
  name: string;
  url: string;
  uptime: number;
  down: boolean;
}[]

export type InvidiousInstance = [
  string,
  {
    uri: string;
    type: "https" | "http" | "onion" | "i2p";
    monitor: null | {
      uptime: number;
      down: boolean;
    };
  }
]