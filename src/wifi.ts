import { exec, spawn, ChildProcess, ChildProcessWithoutNullStreams } from 'child_process';
import { logger as parentLogger } from "./logger.js";
import { EventEmitter } from 'events';

const WPA_CLI_PATH = "/usr/sbin/wpa_cli";
const IFACE = 'wlan0';
const logger = parentLogger.child({module:'wifi'});

export interface WifiState {
    bssid:string,
    freq:number,
    ssid:string,
    id:number,
    mode:string,
    pairwise_cipher:string,
    group_cipher:string,
    key_mgmt:string,
    wpa_state:string,
    ip_address:string,
    p2p_device_address:string,
    address:string,
    uuid:string
}

type WifiConnectedEventListener = (wifiState:WifiState) => void;
type WifiDisconnectedEventListener = () => void;

export type WifiController = {
    connect:typeof connectKnownNetwork,
    onConnect:(l:WifiConnectedEventListener) => void,
    onDisconnect:(l:WifiDisconnectedEventListener) => void,
    close:() => void
 };

 const WIFI_EVENT_CONNECTED = "wifi_connect";
 const WIFI_EVENT_DISCONNECTED = "wifi_disconnect";
 const WIFI_EVENT_ERROR = "wifi_error";

export async function useWifi(user:(ctrl:WifiController)=>void) {
    const l = logger.child({function:useWifi.name});
    l.trace("enter");

    const wifiProcess = await spawnWifiProcess();
    const events = new EventEmitter();
    const wifiEventRegex = /<(\d)>((?:[A-Z]|-){2,})/g;

    wifiProcess.stdout.on("data", async (data:Buffer) => {
        const dataString = data.toString();
        l.trace({dataString}, "wpa_cli event");

        for (let m of dataString.matchAll(wifiEventRegex)) {
            l.debug({match:m}, "wpa_cli event match");
            switch (m[2]) {
                case "CTRL-EVENT-CONNECTED":
                    const s = await wpacli_status();

                    l.info({event:WIFI_EVENT_CONNECTED, ssid:s.ssid}, "wifi connected");
                    events.emit(WIFI_EVENT_CONNECTED, s);
                    break;
                case "CTRL-EVENT-DISCONNECTED":
                    l.info({event:WIFI_EVENT_DISCONNECTED}, "wifi disconnected");
                    events.emit(WIFI_EVENT_DISCONNECTED);
                    break;
                case "CTRL-EVENT-SCAN-RESULTS":
                    break;
            }
        }
    });

    // TODO: Handle unexpected exit of child process

    user({
        connect: connectKnownNetwork,
        onConnect: (l) => events.on(WIFI_EVENT_CONNECTED, l),
        onDisconnect: (l) => events.on(WIFI_EVENT_DISCONNECTED, l),
        close: () => wifiProcess.kill()
    });
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

function spawnWifiProcess() {
    const l = logger.child({function:spawnWifiProcess.name});
    l.trace("enter");

    return new Promise<ChildProcessWithoutNullStreams>((resolve, reject) => {
        const args = ["-i", IFACE];
        const p = spawn(WPA_CLI_PATH, args);

        p.on("spawn", () => resolve(p));

        p.on("error", reject);

        p.on("exit", (code) => {
            if (code) {
                l.warn(`wpa_cli exited with code ${code}.`);
            }
        });
    });
}

/**
 * Connect to a network pre-configured in wpa_supplicant.conf
 * @param ssid ssid to connect to. If not defined, connect to any known network.
 */
async function connectKnownNetwork(ssid?:string) {
    const l = logger.child({function:connectKnownNetwork.name});
    l.debug({ssid:ssid}, "enter");

    if (ssid) {
        l.debug("list_networks");
        let networks = await wpacli_list_networks();
        l.debug({networks}, "list_networks result");

        let network = networks.find(n => n.ssid == ssid);

        if (network) {
            l.debug({network}, "select_network");
            let ok = await wpacli_selectNetwork(network.id);
            if (!ok) {
                throw new WifiConnectionError(ssid);
            }
        } else {
            throw new WifiError(`Network with SSID '${ssid}' is not configured.`);
        }
    } else {
        l.debug("reconfigure");
        let ok = await wpacli_reconfigure();
        if (!ok) {
            throw new WifiError("reconfigure failed.");
        }
    }
}

interface Network { id:number, ssid:string, bssid:string, state:string }

async function wpacli_list_networks(iface = IFACE) {
    const l = logger.child({function:wpacli_list_networks.name});

    let networks:Network[] = [];

    const result = await wpacli_cmd(iface, 'list_networks');
    l.debug({result}, "wpa_cli list_networks output");

    let output = result.split('\n');
    output.shift(); // remove header

    output.map((line) => {
        const params = line.split('\t');
        networks.push({
            id: parseInt(params[0]),
            ssid: params[1],
            bssid: params[2],
            state: params[3]?.replace(/[\[\]']+/g,'')
        });
    });

    return networks;
}

async function wpacli_status(iface = IFACE) {
    const stateObj:any = {};
    const result = await wpacli_cmd(iface, 'status');
    let output = result.split('\n');
    output.map((line) => {
        const params = line.split('=');
        stateObj[params[0]] = asNumberOrString(params[1]);
    });
    return stateObj as WifiState;
}

async function wpacli_reconfigure(iface = IFACE) {
    const result = await wpacli_cmd(iface, 'reconfigure');
    return result == 'OK';
}

async function wpacli_selectNetwork(id:number, iface = IFACE) {
    const result = await wpacli_cmd(iface, `select_network ${id}`);
    return result == 'OK';
}

function wpacli_cmd(iface:string, command:string) {
    return new Promise<string>((resolve, reject) => {
        const cmd = `wpa_cli -i ${iface} ${command}`;
        exec(cmd, (error, stdout) => {
            if (error) reject(error);

            let output = stdout.trim();
            resolve(output);
        });
    });
}

function asNumberOrString(val:string):number|string {
    if (val.length === 0){
        return val;
    }

    let n = Number(val);

    if (isNaN(n)) {
        return val;
    } else {
        return n;
    }
}
