declare module "rpi-fi" {
    export function disconnect() : Promise<boolean>

    interface Network { id:int, ssid:string, bssid:string, state:string }
    export function list_networks() : Promise<Network[]>

    export function reconfigure():  Promise<boolean>

    export function selectNetwork(id:int) : Promise<boolean>

    interface ScanResult { bssid:string, frequency:number, signalLevel:number, flags:string, ssid:string }
    export function scan() : Promise<ScanResult[]>

    interface State { id:int, ssid:string, bssid:string, wpa_state:string, ipAddress: string }
    export function state() : Promise<State>
}
