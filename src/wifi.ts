import { Network, disconnect, list_networks, selectNetwork, scan, state } from 'rpi-fi';
import { logger as parentLogger } from "./logger.js";

const logger = parentLogger.child({module:'wifi'});

export { scan, disconnect };

/**
 * Connect to a network pre-configured in wpa_supplicant.conf
 * @param ssid 
 */
export async function connectKnownNetwork(ssid:string) {
    const l = logger.child({function:connectKnownNetwork.name});
    l.debug("Entered function.");

    l.debug("Scanning networks...");
    let networks = await list_networks();
    l.debug("Found networks", {networks});

    let network = networks.find(n => n.ssid == ssid);

    if (network) {
        l.debug("Found requested network. Connecting...", {network});
        let ok = await selectNetwork(network.id);
        if (!ok) {
            throw new WifiConnectionError(ssid);
        }
    } else {
        throw new WifiError(`Network with SSID '${ssid}' is not configured.`);
    }
}

export async function currentNetwork() : Promise<Network|null>{
    let st = await state();
    if (st.wpa_state == "COMPLETED") {
        return {
            id: st.id,
            ssid: st.ssid,
            bssid: st.bssid,
            state: st.wpa_state
        };
    } else {
        return null;
    }
}

class WifiError extends Error {
    constructor(msg:string) {
        super(msg);
    }
}

class WifiConnectionError extends WifiError {
    constructor(ssid:string) {
        super(`Connection to network with SSID ${ssid} failed.`);
    }
}