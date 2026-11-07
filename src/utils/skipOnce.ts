import { SegmentUUID } from "../types";

const autoSkippedOnce = new Set<SegmentUUID>();

export function hasAutoSkippedOnce(UUID: SegmentUUID): boolean {
    return autoSkippedOnce.has(UUID);
}

export function markAutoSkippedOnce(UUID: SegmentUUID): void {
    autoSkippedOnce.add(UUID);
}

export function resetAutoSkippedOnce(): void {
    autoSkippedOnce.clear();
}
