import Config from "../config";
import * as CompileConfig from "../../config.json";
import { FetchResponse, sendRequestToCustomServer } from "../../maze-utils/src/background-request-proxy";

/**
 * Sends a request to a custom server
 * 
 * @param type The request type. "GET", "POST", etc.
 * @param address The address to add to the SponsorBlock server address
 * @param callback 
 */    
export function asyncRequestToCustomServer(type: string, url: string, data = {}, headers = {}): Promise<FetchResponse> {
    return sendRequestToCustomServer(type, url, data, headers);
}

/**
 * Sends a request to the SponsorBlock server with address added as a query
 * 
 * @param type The request type. "GET", "POST", etc.
 * @param address The address to add to the SponsorBlock server address
 * @param callback 
 */    
export async function asyncRequestToServer(type: string, address: string, data = {}, headers = {}): Promise<FetchResponse> {
    const serverAddress = Config.config.testingServer ? CompileConfig.testingServerAddress : Config.config.serverAddress;

    return await (asyncRequestToCustomServer(type, serverAddress + address, data, headers));
}

/**
 * Sends a request to the SponsorBlock server with address added as a query
 * 
 * @param type The request type. "GET", "POST", etc.
 * @param address The address to add to the SponsorBlock server address
 * @param callback 
 */
export function sendRequestToServer(type: string, address: string, callback?: (response: FetchResponse) => void): void {
    const serverAddress = Config.config.testingServer ? CompileConfig.testingServerAddress : Config.config.serverAddress;

    // Ask the background script to do the work
    chrome.runtime.sendMessage({
        message: "sendRequest",
        type,
        url: serverAddress + address
    }, (response) => {
        callback(response);
    });
}