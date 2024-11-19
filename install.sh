#!/bin/sh
set -eu

DIR=$(dirname "$0")

npm install
npm run build

sudo systemctl link ${DIR}/systemd/mnt-dashcam_storage.mount ${DIR}/systemd/rpi-dashcam-fetch-fitcamx.service ${DIR}/systemd/rpi-dashcam-push-gcp-bucket.service ${DIR}/systemd/rpi-dashcam-push-ssh.service
#sudo systemctl enable ${DIR}/systemd/rpi-dashcam-fetch-fitcamx.service ${DIR}/systemd/rpi-dashcam-push-gcp-bucket.service
sudo systemctl enable ${DIR}/systemd/mnt-dashcam_storage.mount
sudo systemctl start ${DIR}/systemd/mnt-dashcam_storage.mount

echo "Use 'systemctl edit' to modify service environment variables to your needs."
echo "Then use 'systemctl enable' to enable your required fetch and push services."
