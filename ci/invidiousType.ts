export type InvidiousInstance = [
  string,
  {
    flag: string;
    region: string;
    stats: null | ivStats;
    cors: null | boolean;
    api: null | boolean;
    type: "https" | "http" | "onion" | "i2p";
    uri: string;
    monitor: null | monitor;
  }
]

export type monitor = {
  token: string;
  url: string;
  alias: string;
  last_status: number;
  uptime: number;
  down: boolean;
  down_since: null | string;
  up_since: null | string;
  error: null | string;
  period: number;
  apdex_t: number;
  string_match: string;
  enabled: boolean;
  published: boolean;
  disabled_locations: string[];
  recipients: string[];
  last_check_at: string;
  next_check_at: string;
  created_at: string;
  mute_until: null | string;
  favicon_url: string;
  custom_headers: Record<string, string>;
  http_verb: string;
  http_body: string;
  ssl: {
    tested_at: string;
    expires_at: string;
    valid: boolean;
    error: null | string;
  };
}

export type ivStats = {
  version: string;
  software: {
    name: "invidious" | string;
    version: string;
    branch: "master" | string;
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
  playback: {
    totalRequests: number;
    successfulRequests: number;
    ratio: number;
  };
}