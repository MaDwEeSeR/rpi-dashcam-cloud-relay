import 'dotenv/config';
import { Blob } from 'buffer';
import { Moment } from "moment";
import { googleDrive } from "./google-drive.js";
import { isEmpty, sleep, stringCompare, retry } from "./util.js";
import { logger } from "./logger.js";
import { useWifi } from "./wifi.js";
import { useCamera } from "./camera-fitcamx.js";

const CAMERA_SSID = process.env.CAMERA_SSID;
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const HEARTBEAT_SLOW_DELTA = 600;
const HEARTBEAT_FAST_DELTA = 10;

if (isEmpty(CAMERA_SSID)) {
    logger.error("CAMERA_SSID not set.")
    process.exit(1);
}

// main
(async () => {
    const l = logger.child({function:"main"});
    let currentVideo:VideoFile|null|undefined = null;
    let isVideoUploaded = false;
    let heartbeatTimeout:NodeJS.Timeout|null = null;
    // let filenamesInCloud:Array<string> = [];

    await useWifi(async (wifi) => {
        wifi.onConnect(ws => {
            if (heartbeatTimeout) {
                clearTimeout(heartbeatTimeout);
            }

            if (ws.ssid == CAMERA_SSID) {
                onConnectedToCamera();
            } else {
                onConnectedToInternet();
            }
        });

        wifi.onDisconnect(() => {

        });

        const connectCamera = () => wifi.connect(CAMERA_SSID);
        const connectInternet = () => wifi.connect();

        async function onConnectedToCamera() {
            if (currentVideo) {
                if (isVideoUploaded) {
                    try {
                        await deleteVideoFromCamera(currentVideo);
                        isVideoUploaded = false;
                        currentVideo = null;
                    } catch (err) {
                        l.warn({err}, `Could not delete video from camera: ${(err as Error).message}`);
                    }
                } else {
                    await connectInternet();
                    return;
                }
            }

            try {
                currentVideo = await downloadVideoFromCamera();
            } catch (err) {
                l.warn({err}, `Could not download video from camera: ${(err as Error).message}`);
            } finally {
                if (currentVideo) {
                    await connectInternet();
                } else {
                    heartbeatTimeout = setTimeout(onConnectedToCamera, HEARTBEAT_SLOW_DELTA*1000);
                }
            }
        };

        async function onConnectedToInternet() {
            if (!currentVideo) {
                await connectCamera();
                return;
            }

            try {
                await uploadVideoToCloud(currentVideo);
                isVideoUploaded = true;
                await connectCamera();
            } catch (err) {
                heartbeatTimeout = setTimeout(onConnectedToInternet, HEARTBEAT_SLOW_DELTA*1000);
                l.error({err}, `Could not upload video to cloud: ${(err as Error).message}`);
            }
        }

        await connectCamera();
    });
})();

interface VideoFile {
    name: string
    timestamp: Moment
    mimetype: string
    blob: Blob
    cameraPath: string
}

async function downloadVideoFromCamera() {
    let l = logger.child({function:downloadVideoFromCamera.name});
    l.debug("Entered function.");

    return await useCamera(async c => {
        l.debug("Calling camera.listLockedVideos.");
        let potentialVideos = await c.listLockedVideos();

        l.info({lockedVideos:potentialVideos}, "Got list of locked videos from camera.");

        //potentialVideos = potentialVideos.filter(f => !_filenamesInCloud.includes(f.name));
        //l.debug({lockedVideos:potentialVideos}, "Filtered out filenamesInCloud.");

        let camVideo = potentialVideos.at(0);
        if (camVideo) {
            let videoContent = await camVideo.getContent();
            let video:VideoFile = {
                name: camVideo.name,
                timestamp: camVideo.timestamp,
                mimetype: videoContent.mimetype,
                blob: videoContent.blob,
                cameraPath: camVideo.path
            }
            return video;
        } else {
            return null;
        }
    });
}

async function deleteVideoFromCamera(video:VideoFile) {
    let l = logger.child({function:deleteVideoFromCamera.name});
    l.debug("Entered function.");

    if (video) {
        await useCamera(async c => {
            await c.deleteVideo(video.cameraPath);
        });
    }
}

async function loadFilenamesInCloud() {
    return (await googleDrive.getFolder(GOOGLE_DRIVE_FOLDER_ID).list()).map(f => f.name).sort();
}

async function uploadVideoToCloud(video:VideoFile) {
    await googleDrive.getFolder(GOOGLE_DRIVE_FOLDER_ID).upload(video, video.blob);
}
