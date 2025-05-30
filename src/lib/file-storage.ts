import fs from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { logger } from "./logger.js";
import { reduce } from "async";

const TMPDIR = process.env.TMPDIR ?? "/tmp/";
const VIDEO_TRANSFER_PATH = path.normalize(process.env.VIDEO_TRANSFER_PATH ?? path.join(TMPDIR, "rpi-dashcam-fetch-fitcamx/"));
const STORAGE_HISTORY_PATH = path.join(VIDEO_TRANSFER_PATH, ".fetch_history");

const log = logger.child({module:"file-storage"});


// try to create video transfer directory
try {
    await fs.mkdir(VIDEO_TRANSFER_PATH, { recursive: true });
} catch (err) {
    log.error({dir:VIDEO_TRANSFER_PATH}, "Could not create transfer directory.");
    process.exit(2);
}

async function useHistoryFile<R>(cb: (file:fs.FileHandle) => Promise<R>) {
    const f = await fs.open(STORAGE_HISTORY_PATH, 'w+');
    try {
        return cb(f);
    }
    finally {
        await f.close();
    }
}

async function writeStorageHistory(s:string) {
    const f = await fs.open(STORAGE_HISTORY_PATH, 'w');
    try {
        await f.writeFile(s, "utf8");
        await f.sync();
    } finally {
        await f.close();
    }
}

async function readStorageHistory() {
    let f = null;
    try {
        f = await fs.open(STORAGE_HISTORY_PATH, 'r');
        return await f.readFile("utf8");
    } catch (err) {
        return "0";
    } finally {
        if (f) {
            await f.close();
        }
    }
}

type StreamProducer = () => Promise<Readable>;

async function storeVideo(name:string, openStream:StreamProducer) {
    const l = log.child({function:storeVideo.name});

    const lastStoredFilename:string = await readStorageHistory();

    if (name <= lastStoredFilename) {
        l.warn({filename:name}, "Already stored newer video file, file skipped.");
        return;
    }

    l.debug({filename: name}, "Writing file.");
    let filePath = path.join(VIDEO_TRANSFER_PATH, name);
    try {
        const f = await fs.open(filePath, 'w');
        try {
            await fs.writeFile(f, await openStream());
            await f.sync();
        } finally {
            await f.close();
        }

        await writeStorageHistory(name);
        log.info({filePath}, "Wrote file.");
    }
    catch (err) {
        log.error({err, filePath}, "Error writing file!");
        await fs.rm(filePath, {force:true});

        throw err;
    }
}

interface FileWithStream {
    path: string,
    name: string,
    getSize: () => Promise<number>,
    getStream: () => Promise<Readable>,
    delete: () => Promise<void>
}

async function loadVideos() {
    const filenames = await fs.readdir(VIDEO_TRANSFER_PATH);
    const files:FileWithStream[] = await reduce(filenames, new Array<FileWithStream>(), async (a, fn) => {
        if (fn.startsWith(".")) {
            return a;
        }

        const p = path.join(VIDEO_TRANSFER_PATH, fn);

        const fsStats = await fs.stat(p);
        if (fsStats.isDirectory()) {
            return a;
        }

        let videoFile:FileWithStream = {
            path: p,
            name: fn,
            getSize: async () => (await fs.stat(p)).size,
            getStream: async () => {
                const buffer = await fs.readFile(p);
                return Readable.from(buffer, {autoDestroy:true, objectMode:false});

                //const file = await fs.open(p, "r");
                //return file.createReadStream({autoClose:true}); // createReadStream does not exist before Node 16.11 :(
            },
            delete: () => fs.rm(p, {force:false})
        };

        a?.push(videoFile);

        return a;
    });

    return files;
}

async function deleteVideo(name:string) {
    return fs.rm(path.join(VIDEO_TRANSFER_PATH, name), {force:false});
}

export const fileStorage = {
    deleteVideo,
    loadVideos,
    storeVideo
};