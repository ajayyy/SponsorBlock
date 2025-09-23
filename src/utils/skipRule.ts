import { getCurrentPageTitle } from "../../maze-utils/src/elements";
import { getChannelIDInfo, getVideoDuration } from "../../maze-utils/src/video";
import Config from "../config";
import {ActionType, ActionTypes, CategorySelection, CategorySkipOption, SponsorSourceType, SponsorTime} from "../types";
import { getSkipProfile, getSkipProfileBool } from "./skipProfiles";
import { VideoLabelsCacheData } from "./videoLabels";
import * as CompileConfig from "../../config.json";

export interface Permission {
    canSubmit: boolean;
}

export enum SkipRuleAttribute {
    StartTime = "time.start",
    EndTime = "time.end",
    Duration = "time.duration",
    StartTimePercent = "time.startPercent",
    EndTimePercent = "time.endPercent",
    DurationPercent = "time.durationPercent",
    Category = "category",
    ActionType = "actionType",
    Description = "chapter.name",
    Source = "chapter.source",
    ChannelID = "channel.id",
    ChannelName = "channel.name",
    VideoDuration = "video.duration",
    Title = "video.title"
}

export enum SkipRuleOperator {
    Less = "<",
    LessOrEqual = "<=",
    Greater = ">",
    GreaterOrEqual = ">=",
    Equal = "==",
    NotEqual = "!=",
    Contains = "*=",
    NotContains = "!*=",
    Regex = "~=",
    RegexIgnoreCase = "~i=",
    NotRegex = "!~=",
    NotRegexIgnoreCase = "!~i="
}

export interface AdvancedSkipCheck {
    kind: "check";
    attribute: SkipRuleAttribute;
    operator: SkipRuleOperator;
    value: string | number;
}

export enum PredicateOperator {
    And = "and",
    Or = "or",
}

export interface AdvancedSkipOperator {
    kind: "operator";
    operator: PredicateOperator;
    left: AdvancedSkipPredicate;
    right: AdvancedSkipPredicate;
}

export type AdvancedSkipPredicate = AdvancedSkipCheck | AdvancedSkipOperator;

export interface AdvancedSkipRule {
    predicate: AdvancedSkipPredicate;
    skipOption: CategorySkipOption;
    comments: string[];
}

export function getCategorySelection(segment: SponsorTime | VideoLabelsCacheData): CategorySelection {
    // First check skip rules
    for (const rule of Config.local.skipRules) {
        if (isSkipPredicatePassing(segment, rule.predicate)) {
            return { name: segment.category, option: rule.skipOption } as CategorySelection;
        }
    }

    // Action type filters
    if ("actionType" in segment && (segment as SponsorTime).actionType === "mute" && !getSkipProfileBool("muteSegments")) {
        return { name: segment.category, option: CategorySkipOption.Disabled } as CategorySelection;
    }

    // Then check skip profile
    const profile = getSkipProfile();
    if (profile) {
        const profileSelection = profile.categorySelections.find(selection => selection.name === segment.category);
        if (profileSelection) {
            return profileSelection;
        }
    }

    // Then fallback to default
    for (const selection of Config.config.categorySelections) {
        if (selection.name === segment.category) {
            return selection;
        }
    }
    return { name: segment.category, option: CategorySkipOption.Disabled} as CategorySelection;
}

function getSkipCheckValue(segment: SponsorTime | VideoLabelsCacheData, rule: AdvancedSkipCheck): string | number | undefined {
    switch (rule.attribute) {
        case SkipRuleAttribute.StartTime:
            return (segment as SponsorTime).segment?.[0];
        case SkipRuleAttribute.EndTime:
            return (segment as SponsorTime).segment?.[1];
        case SkipRuleAttribute.Duration:
            return (segment as SponsorTime).segment?.[1] - (segment as SponsorTime).segment?.[0];
        case SkipRuleAttribute.StartTimePercent: {
            const startTime = (segment as SponsorTime).segment?.[0];
            if (startTime === undefined) return undefined;

            return startTime / getVideoDuration() * 100;
        }
        case SkipRuleAttribute.EndTimePercent: {
            const endTime = (segment as SponsorTime).segment?.[1];
            if (endTime === undefined) return undefined;

            return endTime / getVideoDuration() * 100;
        }
        case SkipRuleAttribute.DurationPercent: {
            const startTime = (segment as SponsorTime).segment?.[0];
            const endTime = (segment as SponsorTime).segment?.[1];
            if (startTime === undefined || endTime === undefined) return undefined;

            return (endTime - startTime) / getVideoDuration() * 100;
        }
        case SkipRuleAttribute.Category:
            return segment.category;
        case SkipRuleAttribute.ActionType:
            return (segment as SponsorTime).actionType;
        case SkipRuleAttribute.Description:
            return (segment as SponsorTime).description || "";
        case SkipRuleAttribute.Source:
            switch ((segment as SponsorTime).source) {
                case SponsorSourceType.Local:
                    return "local";
                case SponsorSourceType.YouTube:
                    return "youtube";
                case SponsorSourceType.Autogenerated:
                    return "autogenerated";
                case SponsorSourceType.Server:
                    return "server";
                default:
                    return undefined;
            }
        case SkipRuleAttribute.ChannelID:
            return getChannelIDInfo().id;
        case SkipRuleAttribute.ChannelName:
            return getChannelIDInfo().author;
        case SkipRuleAttribute.VideoDuration:
            return getVideoDuration();
        case SkipRuleAttribute.Title:
            return getCurrentPageTitle() || "";
        default:
            return undefined;
    }
}

function isSkipCheckPassing(segment: SponsorTime | VideoLabelsCacheData, rule: AdvancedSkipCheck): boolean {
    const value = getSkipCheckValue(segment, rule);

    switch (rule.operator) {
        case SkipRuleOperator.Less:
            return typeof value === "number" && value < (rule.value as number);
        case SkipRuleOperator.LessOrEqual:
            return typeof value === "number" && value <= (rule.value as number);
        case SkipRuleOperator.Greater:
            return typeof value === "number" && value > (rule.value as number);
        case SkipRuleOperator.GreaterOrEqual:
            return typeof value === "number" && value >= (rule.value as number);
        case SkipRuleOperator.Equal:
            return value === rule.value;
        case SkipRuleOperator.NotEqual:
            return value !== rule.value;
        case SkipRuleOperator.Contains:
            return String(value).toLocaleLowerCase().includes(String(rule.value).toLocaleLowerCase());
        case SkipRuleOperator.NotContains:
            return !String(value).toLocaleLowerCase().includes(String(rule.value).toLocaleLowerCase());
        case SkipRuleOperator.Regex:
            return new RegExp(rule.value as string).test(String(value));
        case SkipRuleOperator.RegexIgnoreCase:
            return new RegExp(rule.value as string, "i").test(String(value));
        case SkipRuleOperator.NotRegex:
            return !new RegExp(rule.value as string).test(String(value));
        case SkipRuleOperator.NotRegexIgnoreCase:
            return !new RegExp(rule.value as string, "i").test(String(value));
        default:
            return false;
    }
}

function isSkipPredicatePassing(segment: SponsorTime | VideoLabelsCacheData, predicate: AdvancedSkipPredicate): boolean {
    if (predicate.kind === "check") {
        return isSkipCheckPassing(segment, predicate as AdvancedSkipCheck);
    } else { // predicate.kind === "operator"
        // TODO Is recursion fine to use here?
        if (predicate.operator == PredicateOperator.And) {
            return isSkipPredicatePassing(segment, predicate.left) && isSkipPredicatePassing(segment, predicate.right);
        } else { // predicate.operator === PredicateOperator.Or
            return isSkipPredicatePassing(segment, predicate.left) || isSkipPredicatePassing(segment, predicate.right);
        }
    }
}

export function getCategoryDefaultSelection(category: string): CategorySelection {
    for (const selection of Config.config.categorySelections) {
        if (selection.name === category) {
            return selection;
        }
    }
    return { name: category, option: CategorySkipOption.Disabled} as CategorySelection;
}

type TokenType =
    | "if" // Keywords
    | "disabled" | "show overlay" | "manual skip" | "auto skip" // Skip option
    | `${SkipRuleAttribute}` // Segment attributes
    | `${SkipRuleOperator}` // Segment attribute operators
    | "and" | "or" // Expression operators
    | "(" | ")" | "comment" // Syntax
    | "string" | "number" // Literal values
    | "eof" | "error"; // Sentinel and special tokens

export interface SourcePos {
    line: number;
    // column: number;
}

export interface Span {
    start: SourcePos;
    end: SourcePos;
}

interface Token {
    type: TokenType;
    span: Span;
    value: string;
}

interface LexerState {
    source: string;
    start: number;
    current: number;

    start_pos: SourcePos;
    current_pos: SourcePos;
}

function nextToken(state: LexerState): Token {
    function makeToken(type: TokenType): Token {
        return {
            type,
            span: { start: state.start_pos, end: state.current_pos, },
            value: state.source.slice(state.start, state.current),
        };
    }

    /**
     * Returns the UTF-16 value at the current position and advances it forward.
     * If the end of the source string has been reached, returns <code>null</code>.
     *
     * @return current UTF-16 value, or <code>null</code> on EOF
     */
    function consume(): string | null {
        if (state.source.length > state.current) {
            // The UTF-16 value at the current position, which could be either a Unicode code point or a lone surrogate.
            // The check above this is also based on the UTF-16 value count, so this should not be able to fail on “weird” inputs.
            const c = state.source[state.current];
            state.current++;

            if (c === "\n") {
                state.current_pos.line++;
                // state.current_pos.column = 1;
            } else {
                // // TODO This will be wrong on anything involving UTF-16 surrogate pairs or grapheme clusters with multiple code units
                // // So just don't show column numbers on errors for now
                // state.current_pos.column++;
            }

            return c;
        } else {
            return null;
        }
    }

    /**
     * Returns the UTF-16 value at the current position without advancing it.
     * If the end of the source string has been reached, returns <code>null</code>.
     *
     * @return current UTF-16 value, or <code>null</code> on EOF
     */
    function peek(): string | null {
        if (state.source.length > state.current) {
            // See comment in consume() for Unicode expectations here
            return state.source[state.current];
        } else {
            return null;
        }
    }

    /**
     * Checks the word at the current position against a list of
     * expected keywords. The keyword can consist of multiple characters.
     * If a match is found, the current position is advanced by the length
     * of the keyword found.
     *
     * @param keywords the expected set of keywords at the current position
     * @param caseSensitive whether to do a case-sensitive comparison
     * @return the matching keyword, or <code>null</code>
     */
    function expectKeyword(keywords: readonly string[], caseSensitive: boolean): string | null {
        for (const keyword of keywords) {
            // slice() clamps to string length, so cannot cause out of bounds errors
            const actual = state.source.slice(state.current, state.current + keyword.length);

            if (caseSensitive && keyword === actual || !caseSensitive && keyword.toLowerCase() === actual.toLowerCase()) {
                // Does not handle keywords containing line feeds, which shouldn't happen anyway
                state.current += keyword.length;
                return keyword;
            }
        }

        return null;
    }

    /**
     * Skips a series of whitespace characters starting at the current
     * position. May advance the current position multiple times, once,
     * or not at all.
     */
    function skipWhitespace() {
        let c = peek();
        const whitespace = /\s+/;

        while (c != null) {
            if (!whitespace.test(c)) {
                return;
            }

            consume();
            c = peek();
        }
    }

    /**
     * Skips all characters until the next <code>"\n"</code> (line feed)
     * character occurs (inclusive). Will always advance the current position
     * at least once.
     */
    function skipLine() {
        let c = consume();
        while (c != null) {
            if (c == '\n') {
                return;
            }

            c = consume();
        }
    }

    /**
     * @return whether the lexer has reached the end of input
     */
    function isEof(): boolean {
        return state.current >= state.source.length;
    }

    /**
     * Sets the start position of the next token that will be emitted
     * to the current position.
     *
     * More characters need to be consumed after calling this, as
     * an empty token would be emitted otherwise.
     */
    function resetToCurrent() {
        state.start = state.current;
        state.start_pos = state.current_pos;
    }

    skipWhitespace();
    resetToCurrent();

    if (isEof()) {
        return makeToken("eof");
    }

    const keyword = expectKeyword([
        "if", "and", "or",
        "(", ")",
        "//",
    ].concat(Object.values(SkipRuleAttribute))
        .concat(Object.values(SkipRuleOperator)), true);

    if (keyword !== null) {
        switch (keyword) {
            case "if": return makeToken("if");
            case "and": return makeToken("and");
            case "or": return makeToken("or");

            case "(": return makeToken("(");
            case ")": return makeToken(")");

            case "time.start": return makeToken("time.start");
            case "time.end": return makeToken("time.end");
            case "time.duration": return makeToken("time.duration");
            case "time.startPercent": return makeToken("time.startPercent");
            case "time.endPercent": return makeToken("time.endPercent");
            case "time.durationPercent": return makeToken("time.durationPercent");
            case "category": return makeToken("category");
            case "actionType": return makeToken("actionType");
            case "chapter.name": return makeToken("chapter.name");
            case "chapter.source": return makeToken("chapter.source");
            case "channel.id": return makeToken("channel.id");
            case "channel.name": return makeToken("channel.name");
            case "video.duration": return makeToken("video.duration");
            case "video.title": return makeToken("video.title");

            case "<": return makeToken("<");
            case "<=": return makeToken("<=");
            case ">": return makeToken(">");
            case ">=": return makeToken(">=");
            case "==": return makeToken("==");
            case "!=": return makeToken("!=");
            case "*=": return makeToken("*=");
            case "!*=": return makeToken("!*=");
            case "~=": return makeToken("~=");
            case "~i=": return makeToken("~i=");
            case "!~=": return makeToken("!~=");
            case "!~i=": return makeToken("!~i=");

            case "//":
                resetToCurrent();
                skipLine();
                return makeToken("comment");

            default:
        }
    }

    const keyword2 = expectKeyword(
        [ "disabled", "show overlay", "manual skip", "auto skip" ], false);

    if (keyword2 !== null) {
        switch (keyword2) {
            case "disabled": return makeToken("disabled");
            case "show overlay": return makeToken("show overlay");
            case "manual skip": return makeToken("manual skip");
            case "auto skip": return makeToken("auto skip");
            default:
        }
    }

    let c = consume();

    if (c === '"') {
        // Parses string according to ECMA-404 2nd edition (JSON), section 9 “String”
        let output = "";
        let c = consume();
        let error = false;

        while (c !== null && c !== '"') {
            if (c == '\\') {
                c = consume();

                switch (c) {
                    case '"':
                        output = output.concat('"');
                        break;
                    case '\\':
                        output = output.concat('\\');
                        break;
                    case '/':
                        output = output.concat('/');
                        break;
                    case 'b':
                        output = output.concat('\b');
                        break;
                    case 'f':
                        output = output.concat('\f');
                        break;
                    case 'n':
                        output = output.concat('\n');
                        break;
                    case 'r':
                        output = output.concat('\r');
                        break;
                    case 't':
                        output = output.concat('\t');
                        break;
                    case 'u': {
                        // UTF-16 value sequence
                        const digits = state.source.slice(state.current, state.current + 4);

                        if (digits.length < 4 || !/[0-9a-zA-Z]{4}/.test(digits)) {
                            error = true;
                            output = output.concat(`\\u`);
                            c = consume();
                            continue;
                        }

                        const value = parseInt(digits, 16);
                        // fromCharCode() takes a UTF-16 value without performing validity checks,
                        // which is exactly what is needed here – in JSON, code units outside the
                        // BMP are represented by two Unicode escape sequences.
                        output = output.concat(String.fromCharCode(value));
                        break;
                    }
                    default:
                        error = true;
                        output = output.concat(`\\${c}`);
                        break;
                }
            } else {
                output = output.concat(c);
            }

            c = consume();
        }

        return {
            type: error || c !== '"' ? "error" : "string",
            span: { start: state.start_pos, end: state.current_pos, },
            value: output,
        };
    } else if (/[0-9-]/.test(c)) {
        // Parses number according to ECMA-404 2nd edition (JSON), section 8 “Numbers”
        if (c === '-') {
            c = consume();

            if (!/[0-9]/.test(c)) {
                return makeToken("error");
            }
        }

        const leadingZero = c === '0';
        let next = peek();
        let error = false;

        while (next !== null && /[0-9]/.test(next)) {
            consume();
            next = peek();

            if (leadingZero) {
                error = true;
            }
        }


        if (next !== null && next === '.') {
            consume();
            next = peek();

            if (next === null || !/[0-9]/.test(next)) {
                return makeToken("error");
            }

            do {
                consume();
                next = peek();
            } while (next !== null && /[0-9]/.test(next));
        }

        next = peek();

        if (next != null && (next === 'e' || next === 'E')) {
            consume();
            next = peek();

            if (next === null) {
                return makeToken("error");
            }

            if (next === '+' || next === '-') {
                consume();
                next = peek();
            }

            while (next !== null && /[0-9]/.test(next)) {
                consume();
                next = peek();
            }
        }

        return makeToken(error ? "error" : "number");
    }

    return makeToken("error");
}

export interface ParseError {
    span: Span;
    message: string;
}

export function parseConfig(config: string): { rules: AdvancedSkipRule[]; errors: ParseError[] } {
     // Mutated by calls to nextToken()
    const lexerState: LexerState = {
        source: config,
        start: 0,
        current: 0,

        start_pos: { line: 1 },
        current_pos: { line: 1 },
    };

    let previous: Token = null;
    let current: Token = nextToken(lexerState);

    const rules: AdvancedSkipRule[] = [];
    const errors: ParseError[] = [];
    let erroring = false;
    let panicMode = false;

    /**
     * Adds an error message. The current skip rule will be marked as erroring.
     *
     * @param span the range of the error
     * @param message the message to report
     * @param panic if <code>true</code>, all further errors will be silenced
     *              until panic mode is disabled again
     */
    function errorAt(span: Span, message: string, panic: boolean) {
        if (!panicMode) {
            errors.push({span, message,});
        }

        panicMode ||= panic;
        erroring = true;
    }

    /**
     * Adds an error message for an error occurring at the previous token
     * (which was just consumed).
     *
     * @param message the message to report
     * @param panic if <code>true</code>, all further errors will be silenced
     *              until panic mode is disabled again
     */
    function error(message: string, panic: boolean) {
        errorAt(previous.span, message, panic);
    }

    /**
     * Adds an error message for an error occurring at the current token
     * (which has not been consumed yet).
     *
     * @param message the message to report
     * @param panic if <code>true</code>, all further errors will be silenced
     *              until panic mode is disabled again
     */
    function errorAtCurrent(message: string, panic: boolean) {
        errorAt(current.span, message, panic);
    }

    /**
     * Consumes the current token, which can then be accessed at <code>previous</code>.
     * The next token will be at <code>current</code> after this call.
     *
     * If a token of type <code>error</code> is found, issues an error message.
     */
    function consume() {
        previous = current;
        current = nextToken(lexerState);

        while (current.type === "error") {
            errorAtCurrent(`Unexpected token: ${JSON.stringify(current)}`, true);
            current = nextToken(lexerState);
        }
    }

    /**
     * Checks the current token (that has not been consumed yet) against a set of expected token types.
     *
     * @param expected the set of expected token types
     * @return whether the actual current token matches any expected token type
     */
    function match(expected: readonly TokenType[]): boolean {
        if (expected.includes(current.type)) {
            consume();
            return true;
        } else {
            return false;
        }
    }

    /**
     * Checks the current token (that has not been consumed yet) against a set of expected token types.
     *
     * If there is no match, issues an error message which will be prepended to <code>, got: <token type></code>.
     *
     * @param expected the set of expected token types
     * @param message the error message to report in case the actual token doesn't match
     * @param panic if <code>true</code>, all further errors will be silenced
     *              until panic mode is disabled again
     */
    function expect(expected: readonly TokenType[], message: string, panic: boolean) {
        if (!match(expected)) {
            errorAtCurrent(message.concat(`, got: \`${current.type}\``), panic);
        }
    }

    /**
     * Synchronize with the next rule block and disable panic mode.
     * Skips all tokens until the <code>if</code> keyword is found.
     */
    function synchronize() {
        panicMode = false;

        while (!isEof()) {
            if (current.type === "if") {
                return;
            }

            consume();
        }
    }

    /**
     * @return whether the parser has reached the end of input
     */
    function isEof(): boolean {
        return current.type === "eof";
    }

    while (!isEof()) {
        erroring = false;
        const rule = parseRule();

        if (!erroring) {
            rules.push(rule);
        }

        if (panicMode) {
            synchronize();
        }
    }

    return { rules, errors, };

    function parseRule(): AdvancedSkipRule {
        const rule: AdvancedSkipRule = {
            predicate: null,
            skipOption: null,
            comments: [],
        };

        while (match(["comment"])) {
            rule.comments.push(previous.value.trim());
        }

        expect(["if"], "Expected `if`", true);

        rule.predicate = parsePredicate();

        expect(["disabled", "show overlay", "manual skip", "auto skip"], "Expected skip option after predicate", true);

        switch (previous.type) {
            case "disabled":
                rule.skipOption = CategorySkipOption.Disabled;
                break;
            case "show overlay":
                rule.skipOption = CategorySkipOption.ShowOverlay;
                break;
            case "manual skip":
                rule.skipOption = CategorySkipOption.ManualSkip;
                break;
            case "auto skip":
                rule.skipOption = CategorySkipOption.AutoSkip;
                break;
            default:
                // Ignore, should have already errored
        }

        return rule;
    }

    function parsePredicate(): AdvancedSkipPredicate {
        return parseOr();
    }

    function parseOr(): AdvancedSkipPredicate {
        let left = parseAnd();

        while (match(["or"])) {
            const right = parseAnd();

            left = {
                kind: "operator",
                operator: PredicateOperator.Or,
                left, right,
            };
        }

        return left;
    }

    function parseAnd(): AdvancedSkipPredicate {
        let left = parsePrimary();

        while (match(["and"])) {
            const right = parsePrimary();

            left = {
                kind: "operator",
                operator: PredicateOperator.And,
                left, right,
            };
        }

        return left;
    }

    function parsePrimary(): AdvancedSkipPredicate {
        if (match(["("])) {
            const predicate = parsePredicate();
            expect([")"], "Expected `)` after predicate", true);
            return predicate;
        } else {
            return parseCheck();
        }
    }

    function parseCheck(): AdvancedSkipCheck {
        expect(Object.values(SkipRuleAttribute), "Expected attribute", true);

        if (erroring) {
            return null;
        }

        const attribute = previous.type as SkipRuleAttribute;
        expect(Object.values(SkipRuleOperator), "Expected operator after attribute", true);

        if (erroring) {
            return null;
        }

        const operator = previous.type as SkipRuleOperator;
        expect(["string", "number"], "Expected string or number after operator", true);

        if (erroring) {
            return null;
        }

        const value = previous.type === "number" ? Number(previous.value) : previous.value;

        if ([SkipRuleOperator.Equal, SkipRuleOperator.NotEqual].includes(operator)) {
            if (attribute === SkipRuleAttribute.Category
                && !CompileConfig.categoryList.includes(value as string)) {
                error(`Unknown category: \`${value}\``, false);
                return null;
            } else if (attribute === SkipRuleAttribute.ActionType
                && !ActionTypes.includes(value as ActionType)) {
                error(`Unknown action type: \`${value}\``, false);
                return null;
            } else if (attribute === SkipRuleAttribute.Source
                && !["local", "youtube", "autogenerated", "server"].includes(value as string)) {
                error(`Unknown chapter source: \`${value}\``, false);
                return null;
            }
        }

        return {
            kind: "check",
            attribute, operator, value,
        };
    }
}
