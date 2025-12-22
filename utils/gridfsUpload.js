// utils/gridfsUpload.js
const { Readable } = require("stream");

async function uploadPdfToGridFS({ bucket, buffer, filename, metadata = {} }) {
  return new Promise((resolve, reject) => {
    const stream = Readable.from(buffer);
    const uploadStream = bucket.openUploadStream(filename, {
      contentType: "application/pdf",
      metadata,
    });

    stream.pipe(uploadStream)
      .on("error", reject)
      .on("finish", () => resolve(uploadStream.id));
  });
}

module.exports = { uploadPdfToGridFS };