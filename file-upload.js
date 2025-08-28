const functions = require('@google-cloud/functions-framework');
const { Storage } = require('@google-cloud/storage');
const Busboy = require('busboy');
const keyFilename = require('./gcp-key.json')
const GCS_BUCKET = "meta-media-files";
const storage = new Storage({
    credentials:keyFilename
});
const bucket = storage.bucket(GCS_BUCKET);

// Helper function to upload to GCS
async function uploadFileToGCS(file, filename, mimetype) {
  try {
    const blob = bucket.file(filename);
    const uploadPromise = new Promise((resolve, reject) => {
      const blobStream = blob.createWriteStream({
        metadata: {
          contentType: mimetype
        },
        resumable: false,
      });

      blobStream.on('error', (err) => {
        console.error('GCS upload error:', err);
        reject(err);
      });

      blobStream.on('finish', () => {
        console.log(`${filename} uploaded to ${GCS_BUCKET}`);
        resolve(true);
      });

      file.pipe(blobStream); // Pipe the file stream directly to GCS
    });

    await uploadPromise;
    await blob.makePublic();

    return {
      url: `https://storage.googleapis.com/${GCS_BUCKET}/${filename}`,
      fileName: filename,
      mimetype: mimetype,
    };
  } catch (error) {
    console.error('Error uploading file to GCS:', error);
    return null;
  }
}

// Cloud Function endpoint
functions.http('uploadFile', (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send({ error: 'Method Not Allowed' });
  }

  const busboy = Busboy({ headers: req.headers });

  busboy.on('file', (fieldname, file, info) => {
    const { filename, mimeType } = info;
    const finalFileName = `${Date.now()}_${filename}`;

    uploadFileToGCS(file, finalFileName, mimeType)
      .then(uploadResult => {
        if (!uploadResult) {
          return res.status(500).send({ error: 'Error uploading to Google Cloud Storage' });
        }
        return res.status(200).send(uploadResult);
      })
      .catch(error => {
        console.error('Upload error:', error);
        return res.status(500).send({ error: 'Unexpected server error' });
      });
  });

  // Handle the request stream
  if (req.rawBody) {
    busboy.end(req.rawBody);
  } else {
    req.pipe(busboy);
  }
});