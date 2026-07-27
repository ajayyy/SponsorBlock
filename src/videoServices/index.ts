import { rutubeVideoService } from "./rutube";
import type { VideoService } from "./types";

export type { VideoService } from "./types";

const videoServices = [
    rutubeVideoService
];

export function getActiveVideoService(): VideoService | null {
    return videoServices.find((service) => service.isCurrentHost()) ?? null;
}