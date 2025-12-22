// utils/uploadPdfToGridFS.js
const { Readable } = require("stream");

/**
 * Upload a PDF Buffer to Mongo GridFS bucket and return the fileId (ObjectId)
 */
async function uploadPdfToGridFS({ bucket, buffer, filename, metadata = {} }) {
  if (!bucket) throw new Error("GridFS bucket is missing (bucket is undefined)");
  if (!buffer) throw new Error("No buffer provided");
  if (!filename) throw new Error("filename is required");

  return new Promise((resolve, reject) => {
    const readStream = Readable.from(buffer);

    const uploadStream = bucket.openUploadStream(filename, {
      contentType: "application/pdf",
      metadata,
    });

    readStream
      .pipe(uploadStream)
      .on("error", reject)
      .on("finish", () => resolve(uploadStream.id));
  });
}

module.exports = { uploadPdfToGridFS };