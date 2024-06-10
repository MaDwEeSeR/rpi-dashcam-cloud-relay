import fs from "fs/promises";
import path from "path";
import { logger } from "./lib/logger.js";
import { isEmpty, stringCompare } from "./lib/util.js";
import { useWifi } from "./lib/wifi.js";
import { useCamera } from "./lib/camera-fitcamx.js";
import { Moment } from "moment";
import { eachSeries } from "async";

const CAMERA_SSID = process.env.CAMERA_SSID;
const TMPDIR = process.env.TMPDIR ?? "/tmp";
const VIDEO_TRANSFER_PATH = path.normalize(process.env.VIDEO_TRANSFER_PATH ?? path.join(TMPDIR, "dashcam/"));
const FETCH_HISTORY_PATH = path.join(VIDEO_TRANSFER_PATH, ".fetch_history");
const VIDEO_TRANSFER_LIMIT = Number.parseInt(process.env.VIDEO_TRANSFER_LIMIT ?? "100");

if (isEmpty(CAMERA_SSID)) {
    logger.error("CAMERA_SSID not set.")
    process.exit(1);
}

// try to create video transfer directory
try {
    await fs.mkdir(VIDEO_TRANSFER_PATH, { recursive: true });
} catch (err) {
    logger.error({dir:VIDEO_TRANSFER_PATH}, "Could not create transfer directory.");
    process.exit(2);
}

const HEARTBEAT_DELTA = 10*60*1000; // 10 minutes

// main
(async () => {
    let heartbeatTimeout:NodeJS.Timeout|null = null;

    await useWifi(async (wifi) => {
        wifi.onConnect(ws => {
            if (heartbeatTimeout) {
                clearTimeout(heartbeatTimeout);
                heartbeatTimeout = null;
            }

            if (ws.ssid == CAMERA_SSID) {
                onConnectedToCamera();
            }
        });

        wifi.onDisconnect(() => {
            if (heartbeatTimeout) {
                clearTimeout(heartbeatTimeout);
                heartbeatTimeout = null;
            }
        });

        // in case wifi is already connected at startup
        await onConnectedToCamera();

        async function onConnectedToCamera() {
            const ssid = await wifi.currentSsid();
            if (ssid !== CAMERA_SSID) {
                return;
            }

            try {
                await downloadVideosFromCamera();
            } catch (err) {
                logger.error({err}, `Error downloading video from camera.`);
            } finally {
                heartbeatTimeout = setTimeout(onConnectedToCamera, HEARTBEAT_DELTA);
            }
        };

    });
})();

interface VideoMeta {
    name: string
    timestamp: Moment
    mimetype: string
    cameraPath: string
}

async function downloadVideosFromCamera() {
    let l = logger.child({function:downloadVideosFromCamera.name});
    l.trace("enter");

    await useCamera(async c => {
        l.trace("Calling camera.listLockedVideos.");
        let potentialVideos = await c.listLockedVideos();

        potentialVideos.sort((a, b) => stringCompare(a.name, b.name));

        await eachSeries(potentialVideos, async (camVideo) => {
            await checkTransferDirectory();

            const lastFetchedFile:string = await readFetchHistory();

            if (camVideo.name <= lastFetchedFile) {
                try {
                    await camVideo.delete();
                } catch (err) {
                    l.warn({err}, "Error deleting video from camera.");
                }
                return;
            }

            if (camVideo) {
                let videoContent = await camVideo.getContent();
                let videoMeta:VideoMeta = {
                    name: camVideo.name,
                    timestamp: camVideo.timestamp,
                    mimetype: videoContent.mimetype,
                    cameraPath: camVideo.path
                }

                l.debug({video: videoMeta}, "Writing files.");
                let filePath = path.join(VIDEO_TRANSFER_PATH, camVideo.name);
                let metaFilePath = filePath +  ".meta";
                try {
                    await fs.writeFile(filePath, videoContent.blob.stream());
                    await fs.writeFile(metaFilePath, JSON.stringify(videoMeta));
                    await writeFetchHistory(camVideo.name);
                    await camVideo.delete();
                    l.info({files:[filePath, metaFilePath]}, "Wrote files.");
                }
                catch (err) {
                    await Promise.all([
                        fs.rm(filePath, {force:true}),
                        fs.rm(metaFilePath, {force:true})
                    ]);

                    throw err;
                }
            }    
        });
    });
}

const FETCH_HISTORY_FILE = fs.open(FETCH_HISTORY_PATH, 'a+');

async function writeFetchHistory(s:string) {
    await (await FETCH_HISTORY_FILE).writeFile(s, "utf8");
}

async function readFetchHistory() {
    return (await FETCH_HISTORY_FILE).readFile("utf8");
}

async function checkTransferDirectory() {
    const files = await fs.readdir(VIDEO_TRANSFER_PATH);
    if (files.length < VIDEO_TRANSFER_LIMIT) {
        throw new Error("VIDEO_TRANSFER_LIMIT exceeded!");
    }
}