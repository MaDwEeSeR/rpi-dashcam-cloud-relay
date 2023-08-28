import { map } from "async";
import { basename } from "path";
import fetch, { Blob, Response } from "node-fetch";
import { parse } from 'node-html-parser';
import { connectKnownNetwork } from "./wifi";
import moment, { Moment } from "moment";

export function getCamera(ssid:string, ipAddress:string) {
    return new FitcamxCamera(ssid, ipAddress);
}

const LOCKED_VIDEO_FOLDERS = ["/CARDV/EMR/", "/CARDV/EMR_E/"];

class FitcamxCamera {
    ssid: string
    ipAddress: string

    /**
     *
     */
    constructor(ssid:string, ipAddress:string) {
        this.ssid = ssid;
        this.ipAddress = ipAddress;
    }

    async listLockedVideos() {
        const files:Array<FitcamxFile> = (await map(LOCKED_VIDEO_FOLDERS, async (folder:string) => {
            const res = checkStatus(await fetch(`http://${this.ipAddress}${folder}`));
            const html = parse(await res.text());
            const videoFiles = html.querySelectorAll("tr > td:first-child > a")
                .map(e => {
                    const path = e.getAttribute("href");
                    if (!path) {
                        throw new Error("Empty video path!");
                    }
                    return new FitcamxFile(`http://${this.ipAddress}${path}`);
                });
            return videoFiles;
        })).flat();

        return files;
    }

    connectWifi(): Promise<void> {
        return connectKnownNetwork(this.ssid);
    }
}

class FitcamxFile {
    name:string
    url:string
    timestamp:Moment
    private _content:FitcamxFileContent|undefined = undefined

    /**
     *
     */
    constructor(url:string) {
        this.name = basename(url);
        this.url = url;
        this.timestamp = moment(this.name.substring(0, 14), "YYYYMMDDHHmmss", true);
    }

    async getContent() {
        if (!this._content) {
            const res = checkStatus(await fetch(this.url));
            this._content = {
                blob: await res.blob(),
                mimetype: res.headers.get('Content-Type') ?? "application/octet-stream"
            };
        }

        return this._content;
    }

    async delete() {
        checkStatus(await fetch(this.url + '?del=1'));
    }
}

interface FitcamxFileContent {
    blob:Blob,
    mimetype:string
}

class FitcamxResponseError extends Error {
    response:Response

	constructor(response:Response) {
		super(`Fitcamx HTTP Error Response: ${response.status} ${response.statusText}`);
		this.response = response;
	}
}

function checkStatus(response : Response) {
	if (response.status >= 200 && response.status < 300) {
		return response;
	} else {
		throw new FitcamxResponseError(response);
	}
};
