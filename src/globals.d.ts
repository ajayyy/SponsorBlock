import { SBObject } from "./config";
declare global {
    interface Window { SB: SBObject }
    // Remove this once the API becomes stable and types are shipped in @types/chrome
    namespace chrome {
        namespace declarativeContent {
            export interface RequestContentScriptOptions {
                allFrames?: boolean;
                css?: string[];
                instanceType?: "declarativeContent.RequestContentScript";
                js?: string[];
                matchAboutBlanck?: boolean;
            }
            export class RequestContentScript {
                constructor(options: RequestContentScriptOptions);
            }
        }
    }
}
