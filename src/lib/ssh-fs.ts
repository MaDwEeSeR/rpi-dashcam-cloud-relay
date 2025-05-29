import { NodeSSH, Config as SshConfig } from "node-ssh";
import { logger } from './logger.js';
import { isEmpty } from './util.js';
import path from "path";

const log = logger.child({module:"ssh-fs"});

const SSH_HOST = process.env.SSH_HOST;
const SSH_USER = process.env.SSH_USER;
const SSH_KEYPATH = process.env.SSH_KEYPATH;
const SSH_PASS = process.env.SSH_PASS;
const SSH_REMOTEPATH = process.env.SSH_REMOTEPATH;


if (isEmpty(SSH_HOST)) {
    log.error("SSH_HOST not set.")
    process.exit(1);
}

if (isEmpty(SSH_USER)) {
    log.error("SSH_USER not set.")
    process.exit(1);
}

const sshConfig:SshConfig = {
    host:SSH_HOST,
    username:SSH_USER,
    password:SSH_PASS
};

type SshConsumer<R> = (ssh:NodeSSH) => Promise<R>;

async function useSsh<R>(sshConsumer:SshConsumer<R>) {
    const ssh = new NodeSSH();
    try {
        await ssh.connect(sshConfig);
        return await sshConsumer(ssh);
    } finally {
        ssh.dispose();
    }
}

async function writeFileFromDisk(name:string, filePath:string) {
    await useSsh(async ssh => {
        const remoteFile = isEmpty(SSH_REMOTEPATH) ? name : path.join(SSH_REMOTEPATH!, name);

        await ssh.putFile(filePath, remoteFile);
    });
}

export const sshFs = {
    writeFileFromDisk
};
