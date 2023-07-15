type ratio = {
  ratio: string;
  label: string;
}

export type instanceMap = {
  name: string;
  url: string;
  dailyRatios: {ratio: string; label: string }[];
  thirtyDayUptime: string;
}[]

export type InvidiousInstance = [
  string,
  {
    flag: string;
    region: string;
    stats: null | {
      version: string;
      software: {
        name: string;
        version: string;
        branch: string;
      };
      openRegistrations: boolean;
      usage: {
        users: {
          total: number;
          activeHalfyear: number;
          activeMonth: number;
        };
      };
      metadata: {
        updatedAt: number;
        lastChannelRefreshedAt: number;
      };
    };
    cors: boolean | null;
    api: boolean | null;
    type: "https" | "http" | "onion" | "i2p";
    uri: string;
    monitor: null | {
      monitorId: number;
      createdAt: number;
      statusClass: string;
      name: string;
      url: string | null;
      type: "HTTP(s)";
      dailyRatios: ratio[];
      "90dRatio": ratio;
      "30dRatio": ratio;
    };
  }
]