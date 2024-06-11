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
    name?:string,
    err?:Error
}

export async function uploadFiles(paths:string[]) {
    const l = log.child({function:uploadFiles.name});

    const options:UploadManyFilesOptions = {
        skipIfExists: true
    };

    l.debug({paths}, "uploading files");
    const results = await transferManager.uploadManyFiles(paths, options);
    l.debug({results}, "upload complete");
    return results.map(res => ({
        name: res[0].name
    }) as UploadFilesProgress);
}
