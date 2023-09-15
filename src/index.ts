import 'dotenv/config';
import { Blob } from 'buffer';
import { Moment } from "moment";
import { googleDrive } from "./google-drive.js";
import { isEmpty, sleep, stringCompare } from "./util.js";
import { logger } from "./logger.js";
import { getCamera } from "./camera-fitcamx.js";

const CAMERA_SSID = process.env.CAMERA_SSID;
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const HEARTBEAT_SLOW_DELTA = 600;
const HEARTBEAT_FAST_DELTA = 10;

if (isEmpty(CAMERA_SSID)) {
    logger.error("CAMERA_SSID not set.")
    process.exit(1);
}

// main
(() => {
    let currentVideo:VideoFile|null|undefined = null;
    let isVideoUploaded = false;
    // let filenamesInCloud:Array<string> = [];
    const l = logger.child({function:"heartbeat"});

    function slowHeartbeat() {
        setTimeout(heartbeat, HEARTBEAT_SLOW_DELTA * 1000);
        l.info({delta:HEARTBEAT_SLOW_DELTA}, "Next heartbeat scheduled");
    }
    
    function fastHeartbeat() {
        setTimeout(heartbeat, HEARTBEAT_FAST_DELTA * 1000)
        l.info({delta:HEARTBEAT_FAST_DELTA}, "Next heartbeat scheduled");
    }

    const heartbeat = async () => {
        l.debug("Heartbeat.");
        // try {
        //     filenamesInCloud = await loadFilenamesInCloud();
        // } catch (err) {
        //     l.warn({err}, "Could not read files in cloud folder.");
        // }

        if (currentVideo) {
            // upload video file to cloud
            try {
                if (!isVideoUploaded) {
                    l.info({video:currentVideo}, "Attempting upload of video to cloud.");
                    await uploadVideoToCloud(currentVideo);
                    isVideoUploaded = true;
                    l.info({video:currentVideo}, "Uploaded video to cloud.");
                }

                try {
                    l.info({video:currentVideo}, "Deleting video from camera.");
                    await deleteVideoFromCamera(currentVideo);
                    currentVideo = null;
                    isVideoUploaded = false;
                    l.info({video:currentVideo}, "Deleted video from camera.");
                } catch (err) {
                    l.error({err}, `Could not delete video from camera: ${(err as Error).message}`);
                }

                fastHeartbeat();
                return;
            } catch (err) {
                l.error({err}, `Could not upload video to cloud: ${(err as Error).message}`);
                slowHeartbeat();
                return;
            }
        } else {
            // check camera for a video file
            try {
                l.info("Attempting download of video from camera.");
                currentVideo = await downloadVideoFromCamera();
                if (currentVideo) {
                    l.info({video:currentVideo}, "Downloaded video from camera.");
                    fastHeartbeat();
                    return;
                } else {
                    // if no video file is found, wait and try again
                    l.info("No video found on camera.");
                }
            } catch (err) {
                l.error({err}, `Could not download video from camera: ${(err as Error).message}`);
            }

            slowHeartbeat();
            return;
        }
    }

    heartbeat();
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

    return await getCamera(CAMERA_SSID!).connect(async c => {
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
        await getCamera(CAMERA_SSID!).connect(async c => {
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
