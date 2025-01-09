import { Blob } from 'buffer';
import { map } from "async";
import { basename } from "path";
import { Readable } from 'stream';
import fetch, { RequestInit, Response } from "node-fetch";
import { parse } from 'node-html-parser';
import moment, { Moment } from "moment";
import streamHead from 'stream-head';
import { retry, stringCompare } from './util.js';
import { logger as parentLogger } from "./logger.js";

const logger = parentLogger.child({module:'camera-fitcamx'});

export async function useCamera<R>(ctrl:(camera:FitcamxCameraController)=>Promise<R>) {
    logger.debug({function:useCamera.name}, "enter");
    return await ctrl(new FitcamxCameraController());
}

const CAMERA_IPADDRESS = "192.168.1.254";
const LOCKED_VIDEO_FOLDERS = ["/CARDV/EMR/", "/CARDV/EMR_E/"];

const REQUEST_OPTIONS:RequestInit = {
    redirect: "error"
};

class FitcamxCameraController {
    constructor() {
    }

    async listLockedVideos() {
        const l = logger.child({function:this.listLockedVideos.name});
        l.trace("enter");

        const files:Array<FitcamxFile> = (await map(LOCKED_VIDEO_FOLDERS, async (folder:string) => {
            const res = await retry(async () => checkStatus(await fetch(`http://${CAMERA_IPADDRESS}${folder}`, REQUEST_OPTIONS), 404));

            if (res.status === 404) {
                l.debug({folder}, "Could not find folder on camera");
                return [];
            } else {
                const html = parse(await res.text());
                l.debug({html:html.outerHTML}, "fetched html from camera");
                const videoFiles = html.querySelectorAll("a[href$=TS]") // select all links that end in TS
                    .map(e => {
                        const path = e.getAttribute("href");
                        if (!path) {
                            throw new Error("Empty video path!");
                        }
                        return new FitcamxFile(path);
                    });
                return videoFiles;
            }
        })).flat().sort((a, b) => stringCompare(a.name, b.name));

        l.debug({files}, "return");
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

    // async getContent() {
    //     if (!this._content) {
    //         const res = await retry(async () => checkStatus(await fetch(`http://${CAMERA_IPADDRESS}${this.path}`)));
    //         this._content = {
    //             blob: (await res.blob()) as Blob,
    //             mimetype: res.headers.get('Content-Type') ?? "application/octet-stream"
    //         };
    //     }

    //     return this._content!;
    // }

    async getStream():Promise<Readable> {
        const res = await retry(async () => checkStatus(await fetch(`http://${CAMERA_IPADDRESS}${this.path}`, REQUEST_OPTIONS)));
        if (!res.body) {
            throw new Error("null body!");
        }

        return await validateStream(res.body) as Readable;
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

async function validateStream(inputStream:NodeJS.ReadableStream): Promise<NodeJS.ReadableStream> {
    const { stream, head } = await streamHead( inputStream, { bytes: 1 } );

    if (head[0] !== 0x47) {
        throw new Error("Expected a Transport Stream header!");
    }

    return stream;
}
