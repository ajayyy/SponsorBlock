import { getStartTimeFromUrl } from '../src/utils/urlParser';

describe("getStartTimeFromUrl", () => {
    it("parses with a number", () => {
        expect(getStartTimeFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=123")).toBe(123);
    });

    it("parses with seconds", () => {
        expect(getStartTimeFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=123s")).toBe(123);
    });

    it("parses with minutes", () => {
        expect(getStartTimeFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=23m3s")).toBe(23 * 60 + 3);
    });

    it("parses with hours", () => {
        expect(getStartTimeFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m3s")).toBe(1 * 60 * 60 + 2 * 60 + 3);
    });

    it("works with time_continue", () => {
        expect(getStartTimeFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&time_continue=123")).toBe(123);
    });

    it("works with no time", () => {
        expect(getStartTimeFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(0);
    });
});