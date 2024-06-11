import { Storage, TransferManager, UploadManyFilesOptions, File, UploadResponse } from '@google-cloud/storage';
import { logger } from './logger.js';
import { isEmpty } from './util.js';

const log = logger.child({module:"gcp-bucket"});

const BUCKET_ID = process.env.GOOGLE_BUCKET;

if (isEmpty(BUCKET_ID)) {
    log.error("GOOGLE_BUCKET not set.")
    process.exit(1);
}

const storage = new Storage();
const bucket = storage.bucket(BUCKET_ID!);
const transferManager = new TransferManager(bucket);

interface UploadFilesProgress {
    name:string,
    err?:Error
}

type UploadFilesProgressCallback = (progress:UploadFilesProgress) => void;

export async function uploadFiles(paths:string[], cb?:UploadFilesProgressCallback) {
    const l = log.child({function:uploadFiles.name});

    function onUploadProgress(e:{err?:Error, file:File, apiResponse:any}) {
        l.debug({filename:e.file?.name, err:e.err}, "upload progress event");

        cb && cb({ name: e.file.name, err: e.err });
    };

    const options:UploadManyFilesOptions = {
        skipIfExists: true,
        passthroughOptions: {
            onUploadProgress: cb ? onUploadProgress : undefined
        }
    };

    const results = await transferManager.uploadManyFiles(paths, options);
    return results.map(res => ({
        name: res[0].name
    }) as UploadFilesProgress);
}
