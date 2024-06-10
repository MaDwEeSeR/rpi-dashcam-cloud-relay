import fs from "fs/promises";
import path from "path";
import moment, { Moment } from "moment"
import { Readable } from "stream"
import { logger } from "./logger.js";
import { ReadableStream } from "stream/web";
import { hash } from "./sha256.js";

const TMPDIR = process.env.TMPDIR ?? "/tmp/";
const VIDEO_TRANSFER_PATH = path.normalize(process.env.VIDEO_TRANSFER_PATH ?? path.join(TMPDIR, "dashcam/"));
const STORAGE_HISTORY_PATH = path.join(VIDEO_TRANSFER_PATH, ".fetch_history");
const VIDEO_TRANSFER_LIMIT = Number.parseInt(process.env.VIDEO_TRANSFER_LIMIT ?? "100");

const log = logger.child({module:"file-storage"});


// try to create video transfer directory
try {
    await fs.mkdir(VIDEO_TRANSFER_PATH, { recursive: true });
} catch (err) {
    log.error({dir:VIDEO_TRANSFER_PATH}, "Could not create transfer directory.");
    process.exit(2);
}

interface VideoFile {
    name: string
    timestamp: Moment
    cameraPath: string
    mimetype: () => Promise<string>
    stream: () => Promise<ReadableStream>
}

interface VideoMetadata {
    name: string
    timestamp: string
    cameraPath: string
    mimetype: string
    sha256: string
}

const STORAGE_HISTORY_FILE = fs.open(STORAGE_HISTORY_PATH, 'a+');

async function writeStorageHistory(s:string) {
    await (await STORAGE_HISTORY_FILE).writeFile(s, "utf8");
}

async function readStorageHistory() {
    return (await STORAGE_HISTORY_FILE).readFile("utf8");
}

async function checkTransferDirectory() {
    const files = await fs.readdir(VIDEO_TRANSFER_PATH);
    if (files.length < VIDEO_TRANSFER_LIMIT) {
        throw new Error("VIDEO_TRANSFER_LIMIT exceeded!");
    }
}

async function metadata(video:VideoFile) {
    return JSON.stringify({
        name: video.name,
        timestamp: video.timestamp.toISOString(),
        cameraPath: video.cameraPath,
        mimetype: await video.mimetype(),
        sha256: hash(await video.stream())
    } as VideoMetadata);
}

export async function storeVideo(video:VideoFile) {
    await checkTransferDirectory();

    const lastStoredFilename:string = await readStorageHistory();

    if (video.name < lastStoredFilename) {
        return;
    }

    log.debug({video: video}, "Writing files.");
    let filePath = path.join(VIDEO_TRANSFER_PATH, video.name);
    let metaFilePath = filePath +  ".meta";
    try {
        await fs.writeFile(filePath, await video.stream());
        await fs.writeFile(metaFilePath, await metadata(video), "utf8");
        await writeStorageHistory(video.name);
        log.info({files:[filePath, metaFilePath]}, "Wrote files.");
    }
    catch (err) {
        log.error({err}, "Error writing files!");
        await Promise.all([
            fs.rm(filePath, {force:true}),
            fs.rm(metaFilePath, {force:true})
        ]);

        throw err;
    }
}

interface LoadedVideoFile {
    metadata: VideoMetadata,
    stream: ReadableStream
}

export async function* loadVideos() {
    const files = await fs.readdir(VIDEO_TRANSFER_PATH);
    for (let f in files) {
        const p = path.join(VIDEO_TRANSFER_PATH, f);
        if (p === STORAGE_HISTORY_PATH) {
            break;
        }

        if (p.endsWith(".meta")) {
            break;
        }

        const videoMeta = JSON.parse(await fs.readFile(p + ".meta", "utf8")) as VideoMetadata;
        const file = await fs.open(p, "r");
        const stream = file.readableWebStream();

        let videoFile:LoadedVideoFile = {
            metadata: videoMeta,
            stream: stream
        };

        yield videoFile;

        file.close();
    }
}

export function deleteVideo(name:string) {
    const paths = [
        path.join(VIDEO_TRANSFER_PATH, name),
        path.join(VIDEO_TRANSFER_PATH, name + ".meta")
    ];

    return Promise.all(
        paths.map(p => fs.rm(p, {force:true}))
    );
}
