import { createHash } from "crypto";
import { ReadStream } from "fs";
import { ReadableStream } from "stream/web";

export function hash(stream:ReadableStream) {
    const hash = createHash("sha256");
    hash.update(ReadStream.fromWeb(stream).read());
    return hash.digest("hex");
}