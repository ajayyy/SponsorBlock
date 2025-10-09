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

// Note that attributes that are prefixes of other attributes (like `time.start`) need to be ordered *after*
// the longer attributes, because these are matched sequentially. Using the longer attribute would otherwise result
// in an error token.
export enum SkipRuleAttribute {
    StartTimePercent = "time.startPercent",
    StartTime = "time.start",
    EndTimePercent = "time.endPercent",
    EndTime = "time.end",
    DurationPercent = "time.durationPercent",
    Duration = "time.duration",
    Category = "category",
    ActionType = "actionType",
    Description = "chapter.name",
    Source = "chapter.source",
    ChannelID = "channel.id",
    ChannelName = "channel.name",
    VideoDuration = "video.duration",
    Title = "video.title"
}

// Note that operators that are prefixes of other attributes (like `<`) need to be ordered *after* the longer
// operators, because these are matched sequentially. Using the longer operator would otherwise result
// in an error token.
export enum SkipRuleOperator {
    LessOrEqual = "<=",
    Less = "<",
    GreaterOrEqual = ">=",
    Greater = ">",
    NotEqual = "!=",
    Equal = "==",
    NotContains = "!*=",
    Contains = "*=",
    NotRegex = "!~=",
    Regex = "~=",
    NotRegexIgnoreCase = "!~i=",
    RegexIgnoreCase = "~i="
}

const SKIP_RULE_ATTRIBUTES = Object.values(SkipRuleAttribute);
const SKIP_RULE_OPERATORS = Object.values(SkipRuleOperator);
const INVERTED_SKIP_RULE_OPERATORS = {
    "<=": SkipRuleOperator.Greater,
    "<": SkipRuleOperator.GreaterOrEqual,
    ">=": SkipRuleOperator.Less,
    ">": SkipRuleOperator.LessOrEqual,
    "!=": SkipRuleOperator.Equal,
    "==": SkipRuleOperator.NotEqual,
    "!*=": SkipRuleOperator.Contains,
    "*=": SkipRuleOperator.NotContains,
    "!~=": SkipRuleOperator.Regex,
    "~=": SkipRuleOperator.NotRegex,
    "!~i=": SkipRuleOperator.RegexIgnoreCase,
    "~i=": SkipRuleOperator.NotRegexIgnoreCase,
};
const WORD_EXTRA_CHARACTER = /[a-zA-Z0-9.]/;
const OPERATOR_EXTRA_CHARACTER = /[<>=!~*&|-]/;
const ANY_EXTRA_CHARACTER = /[a-zA-Z0-9<>=!~*&|.-]/;

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
    displayInverted?: boolean;
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
    | "and" | "or" | "not" // Expression operators
    | "(" | ")" | "comment" // Syntax
    | "string" | "number" // Literal values
    | "eof" | "error"; // Sentinel and special tokens

export interface SourcePos {
    line: number;
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

class Lexer {
    private readonly source: string;
    private start: number;
    private current: number;

    private start_pos: SourcePos;
    private current_pos: SourcePos;

    public constructor(source: string) {
        this.source = source;
        this.start = 0;
        this.current = 0;
        this.start_pos = { line: 1 };
        this.current_pos = { line: 1 };
    }

    private makeToken(type: TokenType): Token {
        return {
            type,
            span: { start: this.start_pos, end: this.current_pos, },
            value: this.source.slice(this.start, this.current),
        };
    }

    /**
     * Returns the UTF-16 value at the current position and advances it forward.
     * If the end of the source string has been reached, returns <code>null</code>.
     *
     * @return current UTF-16 value, or <code>null</code> on EOF
     */
    private consume(): string | null {
        if (this.source.length > this.current) {
            // The UTF-16 value at the current position, which could be either a Unicode code point or a lone surrogate.
            // The check above this is also based on the UTF-16 value count, so this should not be able to fail on “weird” inputs.
            const c = this.source[this.current];
            this.current++;

            if (c === "\n") {
                // Cannot use this.current_pos.line++, because SourcePos is mutable and used in tokens without copying
                this.current_pos = { line: this.current_pos.line + 1, };
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
    private peek(): string | null {
        if (this.source.length > this.current) {
            // See comment in consume() for Unicode expectations here
            return this.source[this.current];
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
    private expectKeyword(keywords: readonly string[], caseSensitive: boolean): string | null {
        for (const keyword of keywords) {
            // slice() clamps to string length, so cannot cause out of bounds errors
            const actual = this.source.slice(this.current, this.current + keyword.length);

            if (caseSensitive && keyword === actual || !caseSensitive && keyword.toLowerCase() === actual.toLowerCase()) {
                // Does not handle keywords containing line feeds, which shouldn't happen anyway
                this.current += keyword.length;
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
    private skipWhitespace() {
        let c = this.peek();
        const whitespace = /\s+/;

        while (c != null) {
            if (!whitespace.test(c)) {
                return;
            }

            this.consume();
            c = this.peek();
        }
    }

    /**
     * Skips all characters until the next <code>"\n"</code> (line feed)
     * character occurs (inclusive). Will always advance the current position
     * at least once.
     */
    private skipLine() {
        let c = this.consume();
        while (c != null) {
            if (c == '\n') {
                return;
            }

            c = this.consume();
        }
    }

    /**
     * @return whether the lexer has reached the end of input
     */
    private isEof(): boolean {
        return this.current >= this.source.length;
    }

    /**
     * Sets the start position of the next token that will be emitted
     * to the current position.
     *
     * More characters need to be consumed after calling this, as
     * an empty token would be emitted otherwise.
     */
    private resetToCurrent() {
        this.start = this.current;
        this.start_pos = this.current_pos;
    }

    public nextToken(): Token {
        this.skipWhitespace();
        this.resetToCurrent();

        if (this.isEof()) {
            return this.makeToken("eof");
        }

        const keyword = this.expectKeyword([
            "if", "and", "or", "not",
            "(", ")",
            "//",
        ].concat(SKIP_RULE_ATTRIBUTES)
            .concat(SKIP_RULE_OPERATORS), true);
        let type: TokenType | null = null;
        let kind: "word" | "operator" | null = null;

        if (keyword !== null) {
            if ((SKIP_RULE_ATTRIBUTES as string[]).includes(keyword)) {
                kind = "word";
                type = keyword as TokenType;
            } else if ((SKIP_RULE_OPERATORS as string[]).includes(keyword)) {
                kind = "operator";
                type = keyword as TokenType;
            } else {
                switch (keyword) {
                    case "if":  // Fallthrough
                    case "and": // Fallthrough
                    case "or": // Fallthrough
                    case "not": kind = "word"; type = keyword as TokenType; break;

                    case "(": return this.makeToken("(");
                    case ")": return this.makeToken(")");

                    case "//":
                        this.resetToCurrent();
                        this.skipLine();
                        return this.makeToken("comment");

                    default:
                }
            }
        } else {
            const keyword2 = this.expectKeyword(
                [ "disabled", "show overlay", "manual skip", "auto skip" ], false);

            if (keyword2 !== null) {
                kind = "word";
                type = keyword2 as TokenType;
            }
        }

        if (type !== null) {
            const more = kind == "operator" ? OPERATOR_EXTRA_CHARACTER : kind == "word" ? WORD_EXTRA_CHARACTER : ANY_EXTRA_CHARACTER;

            let c = this.peek();
            let error = false;
            while (c !== null && more.test(c)) {
                error = true;
                this.consume();
                c = this.peek();
            }

            return this.makeToken(error ? "error" : type);
        }

        let c = this.consume();

        if (c === '"') {
            // Parses string according to ECMA-404 2nd edition (JSON), section 9 “String”
            let output = "";
            let c = this.consume();
            let error = false;

            while (c !== null && c !== '"') {
                if (c == '\\') {
                    c = this.consume();

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
                            const digits = this.source.slice(this.current, this.current + 4);

                            if (digits.length < 4 || !/[0-9a-zA-Z]{4}/.test(digits)) {
                                error = true;
                                output = output.concat(`\\u`);
                                c = this.consume();
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
                } else if (c === '\n') {
                    // Unterminated / multi-line string, unsupported
                    error = true;
                    // Prevent unterminated strings from consuming the entire rest of the input
                    break;
                } else {
                    output = output.concat(c);
                }

                c = this.consume();
            }

            return {
                type: error || c !== '"' ? "error" : "string",
                span: { start: this.start_pos, end: this.current_pos, },
                value: output,
            };
        } else if (/[0-9-]/.test(c)) {
            // Parses number according to ECMA-404 2nd edition (JSON), section 8 “Numbers”
            if (c === '-') {
                c = this.consume();

                if (!/[0-9]/.test(c)) {
                    return this.makeToken("error");
                }
            }

            const leadingZero = c === '0';
            let next = this.peek();
            let error = false;

            while (next !== null && /[0-9]/.test(next)) {
                this.consume();
                next = this.peek();

                if (leadingZero) {
                    error = true;
                }
            }


            if (next !== null && next === '.') {
                this.consume();
                next = this.peek();

                if (next === null || !/[0-9]/.test(next)) {
                    return this.makeToken("error");
                }

                do {
                    this.consume();
                    next = this.peek();
                } while (next !== null && /[0-9]/.test(next));
            }

            next = this.peek();

            if (next != null && (next === 'e' || next === 'E')) {
                this.consume();
                next = this.peek();

                if (next === null) {
                    return this.makeToken("error");
                }

                if (next === '+' || next === '-') {
                    this.consume();
                    next = this.peek();
                }

                while (next !== null && /[0-9]/.test(next)) {
                    this.consume();
                    next = this.peek();
                }
            }

            return this.makeToken(error ? "error" : "number");
        }

        // Consume common characters up to a space for a more useful value in the error token
        const common = ANY_EXTRA_CHARACTER;
        c = this.peek();
        while (c !== null && common.test(c)) {
            this.consume();
            c = this.peek();
        }

        return this.makeToken("error");
    }
}

export interface ParseError {
    span: Span;
    message: string;
}

class Parser {
    private lexer: Lexer;

    private previous: Token;
    private current: Token;

    private readonly rules: AdvancedSkipRule[];
    private readonly errors: ParseError[];

    private erroring: boolean;
    private panicMode: boolean;

    public constructor(lexer: Lexer) {
        this.lexer = lexer;
        this.previous = null;
        this.current = lexer.nextToken();
        this.rules = [];
        this.errors = [];
        this.erroring = false;
        this.panicMode = false;
    }

    // Helper functions

    /**
     * Adds an error message. The current skip rule will be marked as erroring.
     *
     * @param span the range of the error
     * @param message the message to report
     * @param panic if <code>true</code>, all further errors will be silenced
     *              until panic mode is disabled again
     */
    private errorAt(span: Span, message: string, panic: boolean) {
        if (!this.panicMode) {
            this.errors.push({span, message,});
        }

        this.panicMode ||= panic;
        this.erroring = true;
    }

    /**
     * Adds an error message for an error occurring at the previous token
     * (which was just consumed).
     *
     * @param message the message to report
     * @param panic if <code>true</code>, all further errors will be silenced
     *              until panic mode is disabled again
     */
    private error(message: string, panic: boolean) {
        this.errorAt(this.previous.span, message, panic);
    }

    /**
     * Adds an error message for an error occurring at the current token
     * (which has not been consumed yet).
     *
     * @param message the message to report
     * @param panic if <code>true</code>, all further errors will be silenced
     *              until panic mode is disabled again
     */
    private errorAtCurrent(message: string, panic: boolean) {
        this.errorAt(this.current.span, message, panic);
    }

    /**
     * Consumes the current token, which can then be accessed at <code>previous</code>.
     * The next token will be at <code>current</code> after this call.
     *
     * If a token of type <code>error</code> is found, issues an error message.
     */
    private consume() {
        this.previous = this.current;
        // Intentionally ignoring `error` tokens here;
        // by handling those in later privates with more context (match(), expect(), ...),
        // the user gets better errors
        this.current = this.lexer.nextToken();
    }

    /**
     * Checks the current token (that has not been consumed yet) against a set of expected token types.
     *
     * @param expected the set of expected token types
     * @return whether the actual current token matches any expected token type
     */
    private match(expected: readonly TokenType[]): boolean {
        if (expected.includes(this.current.type)) {
            this.consume();
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
    private expect(expected: readonly TokenType[], message: string, panic: boolean) {
        if (!this.match(expected)) {
            this.errorAtCurrent(message.concat(this.current.type === "error" ?  `, got: ${JSON.stringify(this.current.value)}` : `, got: \`${this.current.type}\``), panic);
        }
    }

    /**
     * Synchronize with the next rule block and disable panic mode.
     * Skips all tokens until the <code>if</code> keyword is found.
     */
    private synchronize() {
        this.panicMode = false;

        while (!this.isEof()) {
            if (this.current.type === "if") {
                return;
            }

            this.consume();
        }
    }

    /**
     * @return whether the parser has reached the end of input
     */
    private isEof(): boolean {
        return this.current.type === "eof";
    }

    // Parsing functions

    /**
     * Parse the config. Should only ever be called once on a given
     * <code>Parser</code> instance.
     */
    public parse(): { rules: AdvancedSkipRule[]; errors: ParseError[] } {
        while (!this.isEof()) {
            this.erroring = false;
            const rule = this.parseRule();

            if (!this.erroring && rule) {
                this.rules.push(rule);
            }

            if (this.panicMode) {
                this.synchronize();
            }
        }

        return { rules: this.rules, errors: this.errors, };
    }

    private parseRule(): AdvancedSkipRule | null {
        const rule: AdvancedSkipRule = {
            predicate: null,
            skipOption: null,
            comments: [],
        };

        while (this.match(["comment"])) {
            rule.comments.push(this.previous.value.trim());
        }

        this.expect(["if"], rule.comments.length !== 0 ? "expected `if` after `comment`" : "expected `if`", true);
        rule.predicate = this.parsePredicate();

        this.expect(["disabled", "show overlay", "manual skip", "auto skip"], "expected skip option after condition", true);
        switch (this.previous.type) {
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

    private parsePredicate(): AdvancedSkipPredicate | null {
        return this.parseOr();
    }

    private parseOr(): AdvancedSkipPredicate | null {
        let left = this.parseAnd();

        while (this.match(["or"])) {
            const right = this.parseAnd();

            left = {
                kind: "operator",
                operator: PredicateOperator.Or,
                left, right,
            };
        }

        return left;
    }

    private parseAnd(): AdvancedSkipPredicate | null {
        let left = this.parseUnary();

        while (this.match(["and"])) {
            const right = this.parseUnary();

            left = {
                kind: "operator",
                operator: PredicateOperator.And,
                left, right,
            };
        }

        return left;
    }

    private parseUnary(): AdvancedSkipPredicate | null {
        if (this.match(["not"])) {
            const predicate = this.parseUnary();
            return predicate ? invertPredicate(predicate) : null;
        }

        return this.parsePrimary();
    }

    private parsePrimary(): AdvancedSkipPredicate | null {
        if (this.match(["("])) {
            const predicate = this.parsePredicate();
            this.expect([")"], "expected `)` after condition", true);
            return predicate;
        } else {
            return this.parseCheck();
        }
    }

    private parseCheck(): AdvancedSkipCheck | null {
        this.expect(SKIP_RULE_ATTRIBUTES, `expected attribute after \`${this.previous.type}\``, true);

        if (this.erroring) {
            return null;
        }

        const attribute = this.previous.type as SkipRuleAttribute;
        this.expect(SKIP_RULE_OPERATORS, `expected operator after \`${attribute}\``, true);

        if (this.erroring) {
            return null;
        }

        const operator = this.previous.type as SkipRuleOperator;
        this.expect(["string", "number"], `expected string or number after \`${operator}\``, true);

        if (this.erroring) {
            return null;
        }

        const value = this.previous.type === "number" ? Number(this.previous.value) : this.previous.value;

        if ([SkipRuleOperator.Equal, SkipRuleOperator.NotEqual].includes(operator)) {
            if (attribute === SkipRuleAttribute.Category
                && !CompileConfig.categoryList.includes(value as string)) {
                this.error(`unknown category: \`${value}\``, false);
                return null;
            } else if (attribute === SkipRuleAttribute.ActionType
                && !ActionTypes.includes(value as ActionType)) {
                this.error(`unknown action type: \`${value}\``, false);
                return null;
            } else if (attribute === SkipRuleAttribute.Source
                && !["local", "youtube", "autogenerated", "server"].includes(value as string)) {
                this.error(`unknown chapter source: \`${value}\``, false);
                return null;
            }
        }

        return {
            kind: "check",
            attribute, operator, value,
        };
    }
}

export function parseConfig(config: string): { rules: AdvancedSkipRule[]; errors: ParseError[] } {
    const parser = new Parser(new Lexer(config));
    return parser.parse();
}

export function configToText(config: AdvancedSkipRule[]): string {
    let result = "";

    for (const rule of config) {
        for (const comment of rule.comments) {
            result += "// " + comment + "\n";
        }

        result += "if ";
        result += predicateToText(rule.predicate, null);

        switch (rule.skipOption) {
            case CategorySkipOption.Disabled:
                result += "\nDisabled";
                break;
            case CategorySkipOption.ShowOverlay:
                result += "\nShow Overlay";
                break;
            case CategorySkipOption.ManualSkip:
                result += "\nManual Skip";
                break;
            case CategorySkipOption.AutoSkip:
                result += "\nAuto Skip";
                break;
            default:
                return null; // Invalid skip option
        }

        result += "\n\n";
    }

    return result.trim();
}

function predicateToText(predicate: AdvancedSkipPredicate, outerPrecedence: "or" | "and" | "not" | null): string {
    if (predicate.kind === "check") {
        return `${predicate.attribute} ${predicate.operator} ${JSON.stringify(predicate.value)}`;
    } else if (predicate.displayInverted) {
        // Should always be fine, considering `not` has the highest precedence
        return `not ${predicateToText(invertPredicate(predicate), "not")}`;
    } else {
        let text: string;

        if (predicate.operator === PredicateOperator.And) {
            text = `${predicateToText(predicate.left, "and")} and ${predicateToText(predicate.right, "and")}`;
        } else { // Or
            text = `${predicateToText(predicate.left, "or")} or ${predicateToText(predicate.right, "or")}`;
        }

        return outerPrecedence !== null && outerPrecedence !== predicate.operator ? `(${text})` : text;
    }
}

function invertPredicate(predicate: AdvancedSkipPredicate): AdvancedSkipPredicate {
    if (predicate.kind === "check") {
        return {
            ...predicate,
            operator: INVERTED_SKIP_RULE_OPERATORS[predicate.operator],
        };
    } else {
        // not (a and b) == (not a or not b)
        // not (a or b) == (not a and not b)
        return {
            kind: "operator",
            operator: predicate.operator === "and" ? PredicateOperator.Or : PredicateOperator.And,
            left: predicate.left ? invertPredicate(predicate.left) : null,
            right: predicate.right ? invertPredicate(predicate.right) : null,
            displayInverted: !predicate.displayInverted,
        };
    }
}
