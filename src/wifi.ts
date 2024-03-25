import { Network, list_networks, selectNetwork, reconfigure, scan } from 'rpi-fi';
import { logger as parentLogger } from "./logger.js";

// Connect to any network:
// - enable_network all
// - scan

const logger = parentLogger.child({module:'wifi'});

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

class WifiNotInRangeError extends WifiError {
    constructor(ssid:string) {
        super(`Network with SSID ${ssid} is not in range.`);
    }
}

/**
 * Connect to a network pre-configured in wpa_supplicant.conf
 * @param ssid ssid to connect to. If not defined, connect to any known network.
 */
export async function connectKnownNetwork(ssid?:string) {
    const l = logger.child({function:connectKnownNetwork.name});
    l.debug({msg:"Entered function.", ssid:ssid});

    if (ssid) {
        l.debug("list_networks");
        let networks = await list_networks();
        l.debug({msg:"list_networks result", networks});

        let network = networks.find(n => n.ssid == ssid);

        if (network) {
            await checkNetworkInRange(ssid);

            l.debug({msg:"select_network", network});
            let ok = await selectNetwork(network.id);
            if (!ok) {
                throw new WifiConnectionError(ssid);
            }
        } else {
            throw new WifiError(`Network with SSID '${ssid}' is not configured.`);
        }
    } else {
        l.debug("reconfigure");
        let ok = await reconfigure();
        if (!ok) {
            throw new WifiError("reconfigure failed.");
        }
    }
}

async function checkNetworkInRange(ssid:string) {
    let networks = await scan();
    if (!networks.some(n => n.ssid == ssid)) {
        throw new WifiNotInRangeError(ssid);
    }
}
