import { Blob } from 'buffer';
import { map } from "async";
import { basename } from "path";
import fetch, { Response } from "node-fetch";
import { parse } from 'node-html-parser';
import { connectKnownNetwork, disconnect, scan } from "./wifi.js";
import moment, { Moment } from "moment";
import { retry, stringCompare } from './util.js';
import { logger as parentLogger } from "./logger.js";

const logger = parentLogger.child({module:'camera-fitcamx'});

export function getCamera(ssid:string) {
    logger.debug({function:getCamera.name}, "Entered function.");
    return new FitcamxCamera(ssid);
}

const CAMERA_IPADDRESS = "192.168.1.254";
const LOCKED_VIDEO_FOLDERS = ["/CARDV/EMR/", "/CARDV/EMR_E/"];

class FitcamxCamera {
    ssid: string

    /**
     *
     */
    constructor(ssid:string) {
        this.ssid = ssid;
    }

    async connect<R>(cameraControl: (camera:FitcamxCameraController) => Promise<R>) {
        const l = logger.child({function:this.connect.name});
        l.debug("Entered function.");

        l.debug("Scanning for camera WiFi.");
        const canSeeCamera = (await scan()).some(n => n.ssid == this.ssid);
        if (!canSeeCamera) {
            throw new Error("Cannot see camera WiFi. Not in range?");
        }
        
        l.debug("Camera WiFi found. Trying to connect.");
        await retry(() => connectKnownNetwork(this.ssid));
        try {
            l.debug("Connected to camera WiFi.");
            return await cameraControl(new FitcamxCameraController(this));
        } finally {
            await disconnect();
            await scan();
        }
    }
}

class FitcamxCameraController {
    private _camera:FitcamxCamera

    /**
     *
     */
    constructor(camera:FitcamxCamera) {
        this._camera = camera;
    }

    async listLockedVideos() {
        const l = logger.child({function:this.listLockedVideos.name});
        l.debug("Entered function.");

        const files:Array<FitcamxFile> = (await map(LOCKED_VIDEO_FOLDERS, async (folder:string) => {
            const res = await retry(async () => checkStatus(await fetch(`http://${CAMERA_IPADDRESS}${folder}`)));
            const html = parse(await res.text());
            const videoFiles = html.querySelectorAll("tr > td:first-child > a")
                .map(e => {
                    const path = e.getAttribute("href");
                    if (!path) {
                        throw new Error("Empty video path!");
                    }
                    return new FitcamxFile(path);
                });
            return videoFiles;
        })).flat().sort((a, b) => stringCompare(a.name, b.name));

        return files;
    }

    async deleteVideo(path:string) {
        const l = logger.child({function:this.deleteVideo.name});
        l.debug("Entered function.");

        const file = new FitcamxFile(path);
        return file.delete();
    }
}

class FitcamxFile {
    name:string
    path:string
    timestamp:Moment
    private _content:FitcamxFileContent|undefined = undefined

    /**
     *
     */
    constructor(path:string) {
        this.name = basename(path);
        this.path = path;
        this.timestamp = moment(this.name.substring(0, 14), "YYYYMMDDHHmmss", true);
    }

    async getContent() {
        if (!this._content) {
            const res = await retry(async () => checkStatus(await fetch(`http://${CAMERA_IPADDRESS}${this.path}`)));
            this._content = {
                blob: (await res.blob()) as Blob,
                mimetype: res.headers.get('Content-Type') ?? "application/octet-stream"
            };
        }

        return this._content!;
    }

    async delete() {
        await retry(async () => checkStatus(await fetch(`http://${CAMERA_IPADDRESS}${this.path}?del=1`), 404));
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

function checkStatus(response : Response, ...additionalAllowed:number[]) {
	if ((response.status >= 200 && response.status < 300) || additionalAllowed.includes(response.status)) {
		return response;
	} else {
		throw new FitcamxResponseError(response);
	}
}
