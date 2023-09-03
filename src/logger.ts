import bunyan from "bunyan";

interface HasSsid {
    ssid:string
}

// Create a Bunyan logger that streams to Cloud Logging
// Logs will be written to: "projects/YOUR_PROJECT_ID/logs/bunyan_log"
export const logger = bunyan.createLogger({
    // The JSON payload of the log as it appears in Cloud Logging
    // will contain "name": "my-service"
    name: 'rpi-dashcam-cloud-relay',
    serializers: {
        network: (n:HasSsid) => n.ssid,
        blob: (b?:Blob) => b ? `${b.size} bytes` : b
    },
    streams: [
        // Log to the console at 'info' and above
        {stream: process.stdout, level: 'info'},
        // { type: 'rotating-file', path: '/var/log/rpi-dashcam-cloud-relay.log', period: '1d', count: 7, level: "debug" }
    ],
});

if (process.env.NODE_ENV == "development") {
    logger.level(bunyan.DEBUG);
}