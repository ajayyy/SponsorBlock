import Config from "../config";
import * as CompileConfig from "../../config.json";
import { FetchResponse, sendRequestToCustomServer } from "../../maze-utils/src/background-request-proxy";

/**
 * Sends a request to the SponsorBlock server with address added as a query
 * 
 * @param type The request type. "GET", "POST", etc.
 * @param address The address to add to the SponsorBlock server address
 * @param callback 
 */    
export async function asyncRequestToServer(type: string, address: string, data = {}, headers = {}): Promise<FetchResponse> {
    const serverAddress = Config.config.testingServer ? CompileConfig.testingServerAddress : Config.config.serverAddress;

    return await (sendRequestToCustomServer(type, serverAddress + address, data, headers));
}
