import { Storage, TransferManager, UploadManyFilesOptions, File, UploadResponse } from '@google-cloud/storage';
import { logger } from './logger.js';
import { isEmpty } from './util.js';
import { Readable } from 'stream';

const log = logger.child({module:"gcp-bucket"});

const BUCKET_ID = process.env.GOOGLE_BUCKET;

if (isEmpty(BUCKET_ID)) {
    log.error("GOOGLE_BUCKET not set.")
    process.exit(1);
}

const storage = new Storage();
const bucket = storage.bucket(BUCKET_ID!);

type StreamProducer = () => Promise<Readable>;

async function writeFileFromStream(name:string, openReadStream:StreamProducer) {
    return new Promise<void>(async (resolve, reject) => {
        const file = bucket.file(name);

        const inStream = await openReadStream();

        inStream.pipe(file.createWriteStream())
            .on("error", reject)
            .on("finish", resolve);
    });
}

async function writeFileFromDisk(name:string, filePath:string) {
    return bucket.upload(filePath, {
        destination: name
    });
}

export const gcpBucket = {
    writeFileFromDisk,
    writeFileFromStream
};
