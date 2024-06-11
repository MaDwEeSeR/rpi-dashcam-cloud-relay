import path from "path";
import { Moment } from "moment";
import { eachSeries } from "async";
import { logger } from "./lib/logger.js";
import { isEmpty, stringCompare } from "./lib/util.js";
import { useWifi } from "./lib/wifi.js";
import { useCamera } from "./lib/camera-fitcamx.js";
import { fileStorage } from "./lib/file-storage.js";

const CAMERA_SSID = process.env.CAMERA_SSID;
const HEARTBEAT_DELTA = 10*60*1000; // 10 minutes

if (isEmpty(CAMERA_SSID)) {
    logger.error("CAMERA_SSID not set.")
    process.exit(1);
}


// main
(async () => {
    let heartbeatTimeout:NodeJS.Timeout|null = null;

    await useWifi(async (wifi) => {
        wifi.onConnect(ws => {
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
            if (heartbeatTimeout) {
                clearTimeout(heartbeatTimeout);
                heartbeatTimeout = null;
            }

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

async function downloadVideosFromCamera() {
    let l = logger.child({function:downloadVideosFromCamera.name});
    l.trace("enter");

    await useCamera(async c => {
        l.trace("Calling camera.listLockedVideos.");
        let potentialVideos = await c.listLockedVideos();

        potentialVideos.sort((a, b) => stringCompare(a.name, b.name));

        await eachSeries(potentialVideos, async (camVideo) => {
            await fileStorage.storeVideo(camVideo.name, () => camVideo.getStream());

            try {
                await camVideo.delete();
            } catch (err) {
                l.warn({err}, "Error deleting video from camera.");
            }
        });
    });
}
