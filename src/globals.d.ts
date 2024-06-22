import { SBObject } from "./config";
declare global {
    interface Window { SB: SBObject }
}
