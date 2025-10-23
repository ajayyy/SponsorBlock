import * as React from "react";

import Config from "../../config";
import { configToText, parseConfig, } from "../../utils/skipRule";
import { AdvancedSkipRule } from "../../utils/skipRule.type";

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
        console.error(`[SB] Error on line ${error.span.start.line}: ${error.message}`);
    }

    if (errors.length === 0) {
        return rules;
    } else {
        return null;
    }
}
