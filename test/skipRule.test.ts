import { parseConfig, configToText } from "../src/utils/skipRule";
import { CategorySkipOption } from "../src/types";

describe("advanced skip rule skip options", () => {
    it("parses `auto skip once` without it being shadowed by `auto skip`", () => {
        const { rules, errors } = parseConfig("if category == \"sponsor\"\nauto skip once");

        expect(errors).toEqual([]);
        expect(rules).toHaveLength(1);
        expect(rules[0].skipOption).toBe(CategorySkipOption.SkipOnce);
    });

    it("still parses `auto skip`", () => {
        const { rules, errors } = parseConfig("if category == \"sponsor\"\nauto skip");

        expect(errors).toEqual([]);
        expect(rules[0].skipOption).toBe(CategorySkipOption.AutoSkip);
    });

    it("round trips `auto skip once` through configToText", () => {
        const { rules } = parseConfig("if category == \"sponsor\"\nauto skip once");
        const text = configToText(rules);
        const reparsed = parseConfig(text);

        expect(reparsed.errors).toEqual([]);
        expect(reparsed.rules[0].skipOption).toBe(CategorySkipOption.SkipOnce);
    });
});
