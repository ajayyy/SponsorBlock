import * as React from "react";
import * as CompileConfig from "../../../config.json";

import Config from "../../config";
import { AdvancedSkipRuleSet, SkipRuleAttribute, SkipRuleOperator } from "../../utils/skipRule";
import { ActionType, ActionTypes, CategorySkipOption } from "../../types";

let configSaveTimeout: NodeJS.Timeout | null = null;

export function AdvancedSkipOptionsComponent() {
    const [optionsOpen, setOptionsOpen] = React.useState(false);
    const [config, setConfig] = React.useState(configToText(Config.local.skipRules));
    const [configValid, setConfigValid] = React.useState(true);

    return (
        <div>
            <div className="option-button" onClick={() => {
                setOptionsOpen(!optionsOpen);
            }}>
                {chrome.i18n.getMessage("openAdvancedSkipOptions")}
            </div>

            {
                optionsOpen &&
                <div className="advanced-skip-options-menu">
                    <div className={"advanced-config-help-message"}>
                        <a target="_blank"
                                rel="noopener noreferrer"
                                href="https://wiki.sponsor.ajay.app/w/Advanced_Skip_Options">
                            {chrome.i18n.getMessage("advancedSkipSettingsHelp")}
                        </a>

                        <span className={configValid ? "hidden" : "invalid-advanced-config"}>
                            {" - "}
                            {chrome.i18n.getMessage("advancedSkipNotSaved")}
                        </span>
                    </div>

                    <textarea className={"option-text-box " + (configValid ? "" : "invalid-advanced-config")}
                        rows={10}
                        style={{ width: "80%" }}
                        value={config}
                        spellCheck={false}
                        onChange={(e) => {
                            setConfig(e.target.value);

                            const compiled = compileConfig(e.target.value);
                            setConfigValid(!!compiled && !(e.target.value.length > 0 && compiled.length === 0));

                            if (compiled) {
                                if (configSaveTimeout) {
                                    clearTimeout(configSaveTimeout);
                                }

                                configSaveTimeout = setTimeout(() => {
                                    Config.local.skipRules = compiled;
                                }, 200);
                            }
                        }}
                    />
                </div>
            }
        </div>
    );
}

function compileConfig(config: string): AdvancedSkipRuleSet[] | null {
    const ruleSets: AdvancedSkipRuleSet[] = [];

    let ruleSet: AdvancedSkipRuleSet = {
        rules: [],
        skipOption: null,
        comment: ""
    };

    for (const line of config.split("\n")) {
        if (line.trim().length === 0) {
            // Skip empty lines
            continue;
        }

        const comment = line.match(/^\s*\/\/(.+)$/);
        if (comment) {
            if (ruleSet.rules.length > 0) {
                // Rule has already been created, add it to list if valid
                if (ruleSet.skipOption !== null && ruleSet.rules.length > 0) {
                    ruleSets.push(ruleSet);

                    ruleSet = {
                        rules: [],
                        skipOption: null,
                        comment: ""
                    };
                } else {
                    return null;
                }
            }

            if (ruleSet.comment.length > 0) {
                ruleSet.comment += "; ";
            }

            ruleSet.comment += comment[1].trim();

            // Skip comment lines
            continue;
        } else if (line.startsWith("if ")) {
            if (ruleSet.rules.length > 0) {
                // Rule has already been created, add it to list if valid
                if (ruleSet.skipOption !== null && ruleSet.rules.length > 0) {
                    ruleSets.push(ruleSet);

                    ruleSet = {
                        rules: [],
                        skipOption: null,
                        comment: ""
                    };
                } else {
                    return null;
                }
            }

            const ruleTexts = [...line.matchAll(/\S+ \S+ (?:"[^"\\]*(?:\\.[^"\\]*)*"|\d+)(?= and |$)/g)];
            for (const ruleText of ruleTexts) {
                if (!ruleText[0]) return null;

                const ruleParts = ruleText[0].match(/(\S+) (\S+) ("[^"\\]*(?:\\.[^"\\]*)*"|\d+)/);
                if (ruleParts.length !== 4) {
                    return null; // Invalid rule format
                }

                const attribute = getSkipRuleAttribute(ruleParts[1]);
                const operator = getSkipRuleOperator(ruleParts[2]);
                const value = getSkipRuleValue(ruleParts[3]);
                if (attribute === null || operator === null || value === null) {
                    return null; // Invalid attribute or operator
                }

                if ([SkipRuleOperator.Equal, SkipRuleOperator.NotEqual].includes(operator)) {
                    if (attribute === SkipRuleAttribute.Category
                            && !CompileConfig.categoryList.includes(value as string)) {
                        return null; // Invalid category value
                    } else if (attribute === SkipRuleAttribute.ActionType
                            && !ActionTypes.includes(value as ActionType)) {
                        return null; // Invalid category value
                    } else if (attribute === SkipRuleAttribute.Source
                            && !["local", "youtube", "autogenerated", "server"].includes(value as string)) {
                        return null; // Invalid category value
                    }
                }

                ruleSet.rules.push({
                    attribute,
                    operator,
                    value
                });
            }

            // Make sure all rules were parsed
            if (ruleTexts.length === 0 || !line.endsWith(ruleTexts[ruleTexts.length - 1][0])) {
                return null;
            }
        } else {
            // Only continue if a rule has been defined
            if (ruleSet.rules.length === 0) {
                return null; // No rules defined yet
            }

            switch (line.trim().toLowerCase()) {
                case "disabled":
                    ruleSet.skipOption = CategorySkipOption.Disabled;
                    break;
                case "show overlay":
                    ruleSet.skipOption = CategorySkipOption.ShowOverlay;
                    break;
                case "manual skip":
                    ruleSet.skipOption = CategorySkipOption.ManualSkip;
                    break;
                case "auto skip":
                    ruleSet.skipOption = CategorySkipOption.AutoSkip;
                    break;
                default:
                    return null; // Invalid skip option
            }
        }
    }

    if (ruleSet.rules.length > 0 && ruleSet.skipOption !== null) {
        ruleSets.push(ruleSet);
    } else if (ruleSet.rules.length > 0 || ruleSet.skipOption !== null) {
        // Incomplete rule set
        return null;
    }

    return ruleSets;
}

function getSkipRuleAttribute(attribute: string): SkipRuleAttribute | null {
    if (attribute && Object.values(SkipRuleAttribute).includes(attribute as SkipRuleAttribute)) {
        return attribute as SkipRuleAttribute;
    }

    return null;
}

function getSkipRuleOperator(operator: string): SkipRuleOperator | null {
    if (operator && Object.values(SkipRuleOperator).includes(operator as SkipRuleOperator)) {
        return operator as SkipRuleOperator;
    }

    return null;
}

function getSkipRuleValue(value: string): string | number | null {
    if (!value) return null;

    if (value.startsWith('"')) {
        try {
            return JSON.parse(value);
        } catch (e) {
            return null; // Invalid JSON string
        }
    } else {
        const numValue = Number(value);
        if (!isNaN(numValue)) {
            return numValue;
        }

        return null;
    }
}

function configToText(config: AdvancedSkipRuleSet[]): string {
    let result = "";

    for (const ruleSet of config) {
        if (ruleSet.comment) {
            result += "// " + ruleSet.comment + "\n";
        }

        result += "if ";
        let firstRule = true;
        for (const rule of ruleSet.rules) {
            if (!firstRule) {
                result += " and ";
            }

            result += `${rule.attribute} ${rule.operator} ${JSON.stringify(rule.value)}`;
            firstRule = false;
        }

        switch (ruleSet.skipOption) {
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