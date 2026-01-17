import type { CategorySkipOption } from "../types";

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