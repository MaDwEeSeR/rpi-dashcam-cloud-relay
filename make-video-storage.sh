#!/bin/sh
set -eu

DIR=$(dirname "$0")
LOOPFILE=/var/dashcam_storage.ext4

if [ -f $LOOPFILE ]; then
  echo "$LOOPFILE already exists."
  exit 1
fi


echo "Creating 10 Gb loop filesystem..."
truncate --size=10G $LOOPFILE
mkfs.ext4 $LOOPFILE

echo "Creating mount-point..."
mkdir -vp /mnt/dashcam_storage

echo "All done!"
