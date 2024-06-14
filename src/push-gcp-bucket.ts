import 'dotenv/config';
import { isEmpty } from "./lib/util.js";
import { logger } from "./lib/logger.js";
import { useWifi } from "./lib/wifi.js";
import { gcpBucket } from './lib/gcp-bucket.js';
import { fileStorage } from './lib/file-storage.js';
import { eachLimit } from 'async';

const CAMERA_SSID = process.env.CAMERA_SSID;
const HEARTBEAT_DELTA = 30*1000; // 30 seconds
const UPLOAD_THROTTLE = 1; // To save on memory, as we cannot stream from local files :(

if (isEmpty(CAMERA_SSID)) {
    logger.error("CAMERA_SSID not set.")
    process.exit(1);
}

// main
(async () => {
    const l = logger.child({function:"main"});
    let heartbeatTimeout:NodeJS.Timeout|null = null;

    await useWifi(async (wifi) => {
        wifi.onConnect(ws => {
            l.info({ssid:ws.ssid}, "WiFi connected.");
            onConnectedToInternet();
        });

        wifi.onDisconnect(() => {
            l.info("WiFi disconnected.");
            if (heartbeatTimeout) {
                clearTimeout(heartbeatTimeout);
                heartbeatTimeout = null;
            }
        });

        // in case wifi is already connected at startup
        onConnectedToInternet();


        async function onConnectedToInternet() {
            if (heartbeatTimeout) {
                clearTimeout(heartbeatTimeout);
                heartbeatTimeout = null;
            }

            try {
                const ssid = await wifi.currentSsid();
                if (ssid === CAMERA_SSID) {
                    return;
                }

                const videos = await fileStorage.loadVideos();
                await eachLimit(videos, UPLOAD_THROTTLE, async (fsVideo) => {
                    l.debug({filename:fsVideo.name}, "Uploading video.");
                    await gcpBucket.writeFileFromDisk(fsVideo.name, fsVideo.path);
                    l.info({filename:fsVideo.name}, "Uploaded video.");

                    await fsVideo.delete();
                });
            } catch (err) {
                l.error({err}, "Error while uploading videos to GCP Storage Bucket.");
            } finally {
                heartbeatTimeout = setTimeout(onConnectedToInternet, HEARTBEAT_DELTA);
            }
        }
    });
})();
