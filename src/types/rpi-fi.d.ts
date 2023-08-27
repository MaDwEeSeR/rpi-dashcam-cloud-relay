declare module "rpi-fi" {
    interface Network { id:int, ssid:string, bssid:string, state:string }
    
    interface State { id:int, ssid:string, bssid:string, wpa_state:string, ipAddress: string }

    export function disconnect() : Promise<boolean>

    export function list_networks() : Promise<[Network]>

    export function selectNetwork(id:int) : Promise<boolean>

    export function state() : Promise<State>
}