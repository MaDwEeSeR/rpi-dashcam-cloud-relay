import 'dotenv/config';
import { Blob } from 'buffer';
import { Moment } from "moment";
import { googleDrive } from "./lib/google-drive.js";
import { isEmpty, sleep, stringCompare, retry } from "./lib/util.js";
import { logger } from "./lib/logger.js";
import { useWifi } from "./lib/wifi.js";
import { useCamera } from "./lib/camera-fitcamx.js";

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
            if (heartbeatTimeout) {
                clearTimeout(heartbeatTimeout);
                heartbeatTimeout = null;
            }
        });

        const connectCamera = () => wifi.connect(CAMERA_SSID);
        const connectInternet = () => wifi.connect();

        async function onConnectedToCamera() {
            if (currentVideo) {
                if (isVideoUploaded) {
                    try {
                        await deleteVideoFromCamera(currentVideo);
                        l.info({video:currentVideo}, "video deleted from camera.");
                        isVideoUploaded = false;
                        currentVideo = null;
                    } catch (err) {
                        l.error({err}, `Error when deleting video from camera.`);
                    }
                } else {
                    await connectInternet();
                    return;
                }
            }

            try {
                currentVideo = await downloadVideoFromCamera();
            } catch (err) {
                l.error({err}, `Error downloading video from camera.`);
            } finally {
                if (currentVideo) {
                    await connectInternet();
                } else {
                    heartbeatTimeout = setTimeout(onConnectedToCamera, HEARTBEAT_FAST_DELTA*1000);
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
                l.info({video:currentVideo}, "video uploaded.");
                isVideoUploaded = true;
                await connectCamera();
            } catch (err) {
                heartbeatTimeout = setTimeout(onConnectedToInternet, HEARTBEAT_FAST_DELTA*1000);
                l.error({err}, `Error uploading video to cloud`);
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
    l.trace("enter");

    return await useCamera(async c => {
        l.trace("Calling camera.listLockedVideos.");
        let potentialVideos = await c.listLockedVideos();

        //potentialVideos = potentialVideos.filter(f => !_filenamesInCloud.includes(f.name));
        //l.debug({lockedVideos:potentialVideos}, "Filtered out filenamesInCloud.");

        let camVideo = potentialVideos[0];
        if (camVideo) {
            let videoContent = await camVideo.getContent();
            let video:VideoFile = {
                name: camVideo.name,
                timestamp: camVideo.timestamp,
                mimetype: videoContent.mimetype,
                blob: videoContent.blob,
                cameraPath: camVideo.path
            }

            l.trace({video}, "return");
            return video;
        } else {
            return null;
        }
    });
}

async function deleteVideoFromCamera(video:VideoFile) {
    let l = logger.child({function:deleteVideoFromCamera.name});
    l.debug("enter");

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
