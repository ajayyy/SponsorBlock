import * as React from "react";

import Config from "../../config";
import {AdvancedSkipPredicate, AdvancedSkipRule, parseConfig, PredicateOperator,} from "../../utils/skipRule";
import {CategorySkipOption} from "../../types";

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

function compileConfig(config: string): AdvancedSkipRule[] | null {
    const { rules, errors } = parseConfig(config);

    for (const error of errors) {
        console.log(`Error on line ${error.span.start.line}: ${error.message}`);
    }

    if (errors.length === 0) {
        return rules;
    } else {
        return null;
    }
}

function configToText(config: AdvancedSkipRule[]): string {
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
                result += "\nShow overlay";
                break;
            case CategorySkipOption.ManualSkip:
                result += "\nManual skip";
                break;
            case CategorySkipOption.AutoSkip:
                result += "\nAuto skip";
                break;
            default:
                return null; // Invalid skip option
        }

        result += "\n\n";
    }

    return result.trim();
}

function predicateToText(predicate: AdvancedSkipPredicate, outerPrecedence: PredicateOperator | null): string {
    if (predicate.kind === "check") {
        return `${predicate.attribute} ${predicate.operator} ${JSON.stringify(predicate.value)}`;
    } else {
        let text: string;

        if (predicate.operator === PredicateOperator.And) {
            text = `${predicateToText(predicate.left, PredicateOperator.And)} and ${predicateToText(predicate.right, PredicateOperator.And)}`;
        } else { // Or
            text = `${predicateToText(predicate.left, PredicateOperator.Or)} or ${predicateToText(predicate.right, PredicateOperator.Or)}`;
        }

        return outerPrecedence !== null && outerPrecedence !== predicate.operator ? `(${text})` : text;
    }
}
